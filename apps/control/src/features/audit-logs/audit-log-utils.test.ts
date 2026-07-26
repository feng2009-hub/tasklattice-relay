import { describe, expect, it } from "vitest";
import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import {
  defaultAuditLogFilters,
  filterAuditLogs,
} from "./audit-log-utils";

const now = Date.parse("2026-07-26T12:00:00.000Z");
const baseEvent: PlatformAuditLogEvent = {
  id: "audit-1",
  projectId: "individual",
  occurredAt: "2026-07-26T11:00:00.000Z",
  actor: {
    type: "user",
    id: "maya",
    name: "Maya Chen",
    email: "maya@example.com",
  },
  authorization: {
    scope: "project",
    role: "admin",
    decision: "allowed",
  },
  action: "instance.create",
  verb: "created",
  object: {
    type: "Instance",
    id: "research-assistant",
    name: "Research Assistant",
  },
  outcome: "success",
  summary: "Created a research assistant.",
  request: {
    id: "req-1",
    method: "POST",
    route: "/instances",
    ipAddress: "127.0.0.1",
    userAgent: "Vitest",
  },
};

describe("filterAuditLogs", () => {
  it("searches actor, action, object, and request identifiers", () => {
    for (const query of ["maya", "instance.create", "research assistant", "req-1"]) {
      expect(
        filterAuditLogs(
          [baseEvent],
          { ...defaultAuditLogFilters, query },
          now,
        ),
      ).toHaveLength(1);
    }
  });

  it("combines time, actor, resource, action, and outcome filters", () => {
    expect(
      filterAuditLogs(
        [baseEvent],
        {
          query: "",
          timeRange: "24h",
          actorId: "maya",
          action: "instance.create",
          objectType: "Instance",
          outcome: "success",
        },
        now,
      ),
    ).toEqual([baseEvent]);

    expect(
      filterAuditLogs(
        [baseEvent],
        { ...defaultAuditLogFilters, actorId: "someone-else" },
        now,
      ),
    ).toEqual([]);
  });
});
