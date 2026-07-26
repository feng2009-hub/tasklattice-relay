import type { PlatformAuditLogEvent } from "@tasklattice/contracts";

export type AuditTimeRange = "24h" | "7d" | "30d" | "all";

export interface AuditLogFilters {
  query: string;
  timeRange: AuditTimeRange;
  actorId: string;
  action: string;
  objectType: string;
  outcome: string;
}

export const defaultAuditLogFilters: AuditLogFilters = {
  query: "",
  timeRange: "7d",
  actorId: "all",
  action: "all",
  objectType: "all",
  outcome: "all",
};

const timeRangeMilliseconds: Record<Exclude<AuditTimeRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export function filterAuditLogs(
  events: readonly PlatformAuditLogEvent[],
  filters: AuditLogFilters,
  now = Date.now(),
): PlatformAuditLogEvent[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const cutoff =
    filters.timeRange === "all"
      ? Number.NEGATIVE_INFINITY
      : now - timeRangeMilliseconds[filters.timeRange];

  return events.filter((event) => {
    if (new Date(event.occurredAt).getTime() < cutoff) return false;
    if (filters.actorId !== "all" && event.actor.id !== filters.actorId) return false;
    if (filters.action !== "all" && event.action !== filters.action) return false;
    if (filters.objectType !== "all" && event.object.type !== filters.objectType) {
      return false;
    }
    if (filters.outcome !== "all" && event.outcome !== filters.outcome) return false;
    if (!normalizedQuery) return true;

    return [
      event.actor.name,
      event.actor.email ?? "",
      event.action,
      event.verb,
      event.object.type,
      event.object.id,
      event.object.name,
      event.summary,
      event.request.id,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function countAdvancedAuditFilters(filters: AuditLogFilters): number {
  return [
    filters.actorId,
    filters.action,
    filters.objectType,
    filters.outcome,
  ].filter((value) => value !== "all").length;
}

export function auditActionLabel(action: string): string {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}

export function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
