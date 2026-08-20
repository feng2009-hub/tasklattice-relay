import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";

const departmentBudgetLockNamespace = 0x54414c49;

function departmentBudgetLockKey(departmentId: string): number {
  return createHash("sha256").update(departmentId).digest().readInt32BE(0);
}

/**
 * Serialize Department budget and child Project allocation changes across all
 * Control replicas. The invariant spans multiple rows, so a database advisory
 * lock is the narrowest reliable boundary.
 */
export async function lockDepartmentBudget(
  transaction: Prisma.TransactionClient,
  departmentId: string,
): Promise<void> {
  await transaction.$queryRawUnsafe(
    "SELECT pg_advisory_xact_lock($1::integer, $2::integer)::text AS lock_result",
    departmentBudgetLockNamespace,
    departmentBudgetLockKey(departmentId),
  );
}
