import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "../test/prisma";
import { AuditLogService } from "./audit-log-service";

let database: PrismaClient | undefined;

afterEach(async () => {
  await database?.$disconnect();
  database = undefined;
});

describe("AuditLogService", () => {
  it("returns structured Project events with retained request attachments", async () => {
    database = createTestPrisma();
    const events = await new AuditLogService("individual", database).list();

    expect(events).toHaveLength(8);
    expect(events[0]).toMatchObject({
      actor: {
        type: "user",
      },
      authorization: {
        scope: "project",
      },
      object: {
        type: expect.any(String),
      },
      request: {
        id: expect.stringMatching(/^req_/),
        parameters: expect.any(Object),
      },
    });
    expect(
      events.some((event) => event.request.body !== undefined),
    ).toBe(true);
    expect(
      events.some((event) => event.authorization.decision === "denied"),
    ).toBe(true);
  });
});
