import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type Client as PgClient } from "pg";
import migration from "../../prisma/migrations/20260723000000_initial_control_plane/migration.sql?raw";
import seedMigration from "../../prisma/migrations/20260723001000_seed_control_plane/migration.sql?raw";
import { PrismaClient } from "../generated/prisma/client";

export function createTestPrisma(): PrismaClient {
  const require = createRequire(import.meta.url);
  const { DataType, newDb } = require("pg-mem") as typeof import("pg-mem");
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: "to_timestamp",
    args: [DataType.integer],
    returns: DataType.timestamptz,
    implementation: (seconds: number) => new Date(seconds * 1_000),
  });
  // pg-mem models NUMERIC values but does not parse PostgreSQL precision
  // metadata. Production migrations retain Prisma's DECIMAL(65,30).
  memory.public.none(migration.replaceAll("DECIMAL(65,30)", "NUMERIC"));
  memory.public.none(seedMigration);
  const pg = memory.adapters.createPg();
  const query = pg.Client.prototype.query;
  pg.Client.prototype.query = function (
    this: PgClient,
    input: string | { rowMode?: string; types?: unknown },
    ...args: unknown[]
  ) {
    if (typeof input === "object") {
      const arrayRows = input.rowMode === "array";
      const { rowMode: _rowMode, types: _types, ...compatible } = input;
      const transform = (result: { fields?: Array<{ name: string }>; rows?: Array<Record<string, unknown>> }) => {
        if (arrayRows && result.rows) {
          const fieldNames = result.fields?.map((field) => field.name) ?? [];
          const names = fieldNames.length && fieldNames.every(Boolean)
            ? fieldNames
            : Object.keys(result.rows[0] ?? {});
          const sample = result.rows[0] ?? {};
          const oid = (value: unknown) =>
            value instanceof Date ? 1184
              : typeof value === "boolean" ? 16
                : typeof value === "number" ? 701
                  : typeof value === "bigint" ? 20
                    : typeof value === "object" && value !== null ? 3802
                      : 25;
          const fields = names.map((name, index) => ({
            ...(result.fields?.[index] ?? {}),
            name,
            dataTypeID: (result.fields?.[index] as { dataTypeID?: number } | undefined)?.dataTypeID ?? oid(sample[name]),
          }));
          return {
            ...result,
            fields,
            rows: result.rows.map((row) => names.map((name, index) =>
              fields[index]?.dataTypeID === 3802 && typeof row[name] === "object"
                ? JSON.stringify(row[name])
                : row[name],
            )),
          };
        }
        return result;
      };
      const callbackIndex = args.findLastIndex((argument) => typeof argument === "function");
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex] as (error: unknown, result: unknown) => void;
        args[callbackIndex] = (error: unknown, result: Parameters<typeof transform>[0]) =>
          callback(error, error ? result : transform(result));
      }
      const result = query.call(this, compatible, ...args);
      return result && typeof (result as Promise<unknown>).then === "function"
        ? (result as Promise<Parameters<typeof transform>[0]>).then(transform)
        : result;
    }
    return query.call(this, input, ...args);
  } as typeof query;
  const pool = new Pool({ Client: pg.Client } as never);
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
