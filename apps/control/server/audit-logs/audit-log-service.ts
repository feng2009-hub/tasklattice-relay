import type {
  PlatformAuditActorType,
  PlatformAuditLogEvent,
  PlatformAuditOutcome,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

export class AuditLogService {
  constructor(
    private readonly projectId: string,
    private readonly db: PrismaClient = prisma(),
  ) {}

  async list(): Promise<PlatformAuditLogEvent[]> {
    const rows = await this.db.auditLogRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { occurredAt: "desc" },
      take: 250,
    });

    return rows.map((row) => {
      const parameters = optionalObject(row.parameters);
      const metadata = optionalObject(row.metadata);
      return {
        id: row.id,
        projectId: row.projectId,
        occurredAt: row.occurredAt.toISOString(),
        actor: {
          type: row.actorType as PlatformAuditActorType,
          id: row.actorId,
          name: row.actorName,
          ...(row.actorEmail ? { email: row.actorEmail } : {}),
        },
        authorization: {
          scope: "project",
          role: row.authorizationRole,
          decision: row.authorizationDecision as "allowed" | "denied",
        },
        action: row.action,
        verb: row.verb,
        object: {
          type: row.objectType,
          id: row.objectId,
          name: row.objectName,
        },
        outcome: row.outcome as PlatformAuditOutcome,
        summary: row.summary,
        request: {
          id: row.requestId,
          method: row.httpMethod,
          route: row.route,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          ...(parameters ? { parameters } : {}),
          ...(row.requestBody !== null ? { body: row.requestBody } : {}),
        },
        ...(metadata ? { metadata } : {}),
      };
    });
  }
}
