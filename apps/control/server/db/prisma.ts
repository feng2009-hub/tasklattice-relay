import { PrismaPg } from "@prisma/adapter-pg";
import { getControlConfig } from "../config/control-config";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  var taliPrisma: PrismaClient | undefined;
}

export function prisma(): PrismaClient {
  if (!globalThis.taliPrisma) {
    const adapter = new PrismaPg(
      {
        connectionString: getControlConfig().database.url,
        max: 10,
      },
      { schema: "tasklattice" },
    );
    globalThis.taliPrisma = new PrismaClient({ adapter });
  }
  return globalThis.taliPrisma;
}

export async function databaseHealth(): Promise<void> {
  await prisma().$queryRaw`SELECT 1`;
}
