import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  var tasklatticePrisma: PrismaClient | undefined;
}

function connectionString(): string {
  const value = process.env.TALI_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "TALI_DATABASE_URL is required. TaskLattice no longer supports SQLite.",
    );
  }
  return value;
}

export function prisma(): PrismaClient {
  if (!globalThis.tasklatticePrisma) {
    const adapter = new PrismaPg(
      {
        connectionString: connectionString(),
        max: Number(process.env.TALI_DATABASE_POOL_SIZE ?? 10),
      },
      { schema: "tasklattice" },
    );
    globalThis.tasklatticePrisma = new PrismaClient({ adapter });
  }
  return globalThis.tasklatticePrisma;
}

export async function databaseHealth(): Promise<void> {
  await prisma().$queryRaw`SELECT 1`;
}
