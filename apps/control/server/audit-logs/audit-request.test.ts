import { afterEach, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "../test/prisma";
import {
  captureAuditRequest,
  writeAuditResponse,
} from "./audit-request";

let database: PrismaClient | undefined;

afterEach(async () => {
  await database?.$disconnect();
  database = undefined;
});

describe("platform audit request capture", () => {
  it("classifies side-effect routes and redacts credentials recursively", async () => {
    database = createTestPrisma();
    const captured = await captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/providers",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "vitest",
          "x-request-id": "request-provider-create",
        },
        body: JSON.stringify({
          name: "DeepSeek",
          credential: {
            apiKey: "sk-never-store",
            token: "also-never-store",
          },
          config: { endpoint: "https://api.example.test" },
        }),
      },
    ));
    expect(captured).toMatchObject({
      descriptor: {
        action: "provider.create",
        objectType: "Provider",
        projectId: "individual",
      },
      body: {
        credential: "[REDACTED]",
      },
    });

    await writeAuditResponse(
      captured!,
      new Response(JSON.stringify({
        account: { id: "provider-deepseek", name: "DeepSeek" },
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      database,
    );

    const row = await database.auditLogRecord.findFirstOrThrow({
      where: { requestId: "request-provider-create" },
    });
    expect(row).toMatchObject({
      action: "provider.create",
      objectId: "provider-deepseek",
      objectName: "DeepSeek",
      outcome: "success",
      projectId: "individual",
    });
    expect(JSON.stringify(row.requestBody)).not.toContain("sk-never-store");
    expect(JSON.stringify(row.requestBody)).not.toContain("also-never-store");
  });

  it("explicitly excludes read-only vector search POST requests", async () => {
    expect(await captureAuditRequest(new Request(
      "http://tali.local/api/internal/vector-stores/individual/v1/vector_stores/kb/search",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "audit" }),
      },
    ))).toBeUndefined();
  });

  it("records platform changes without inventing a Project relation", async () => {
    database = createTestPrisma();
    const captured = await captureAuditRequest(new Request(
      "http://tali.local/api/v1/platform/settings",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-platform-settings",
        },
        body: JSON.stringify({ enabledProviderKinds: ["openai"] }),
      },
    ));

    expect(captured).toMatchObject({
      descriptor: {
        action: "platform.settings_update",
        objectId: "platform",
        objectType: "Platform Settings",
      },
    });
    expect(captured?.descriptor).not.toHaveProperty("projectId");

    await writeAuditResponse(
      captured!,
      new Response(JSON.stringify({ revision: 2 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      database,
    );

    await expect(database.auditLogRecord.findFirstOrThrow({
      where: { requestId: "request-platform-settings" },
    })).resolves.toMatchObject({
      action: "platform.settings_update",
      objectId: "platform",
      projectId: null,
    });
  });

  it("excludes read-only cost analytics requests", async () => {
    expect(await captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/costs/breakdown",
    ))).toBeUndefined();
  });

  it("captures only the sensitive audit read paths", async () => {
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/instances/agent-1/audit",
    ))).resolves.toMatchObject({
      descriptor: {
        action: "instance.audit_view",
        objectId: "agent-1",
        objectType: "Instance Audit",
        operation: "view",
        projectId: "individual",
      },
    });
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/audit-logs?include_sensitive=true",
    ))).resolves.toMatchObject({
      descriptor: {
        action: "audit_log.sensitive_content_view",
        objectType: "Audit Log",
        operation: "view",
        projectId: "individual",
      },
    });
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/audit-logs/?include_sensitive=true",
    ))).resolves.toMatchObject({
      descriptor: { action: "audit_log.sensitive_content_view" },
    });
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/audit-logs",
    ))).resolves.toBeUndefined();
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/instances/agent-1/interaction",
    ))).resolves.toMatchObject({
      descriptor: {
        action: "instance.interact",
        objectId: "agent-1",
        objectType: "Agent Instance",
        operation: "view",
        projectId: "individual",
      },
    });
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/instances/agent-1/logs",
    ))).resolves.toMatchObject({
      descriptor: {
        action: "instance.logs_view",
        objectId: "agent-1",
        objectType: "Runtime Log",
        operation: "view",
        projectId: "individual",
      },
    });
  });

  it("classifies every side-effect API route", async () => {
    const routeRoot = fileURLToPath(new URL("../routes/api/v1", import.meta.url));
    const routeFiles = readdirSync(routeRoot, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(routeRoot, `${entry.parentPath}/${entry.name}`))
      .filter((path) => /\.(?:post|put|patch|delete)\.ts$/.test(path));

    const uncovered: string[] = [];
    for (const file of routeFiles) {
      const method = file.match(/\.([^.]+)\.ts$/)![1]!.toUpperCase();
      const route = file
        .replace(/\.(?:post|put|patch|delete)\.ts$/, "")
        .replace(/\/index$/, "")
        .replace(/\[projectId\]/g, "individual")
        .replace(/\[[^\]]+\]/g, "test-object");
      const request = new Request(`http://tali.local/api/v1/${route}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!await captureAuditRequest(request)) uncovered.push(file);
    }

    expect(uncovered).toEqual([]);
    expect(routeFiles).toHaveLength(46);
  });

  it("records direct Project role switches", async () => {
    await expect(captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/role",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      },
    ))).resolves.toMatchObject({
      descriptor: {
        action: "project_role.switch",
        objectId: "individual",
        objectType: "Project Role",
        operation: "switch",
        projectId: "individual",
      },
    });
  });

  it("persists the exact CAP decision instead of inferring it from HTTP status", async () => {
    database = createTestPrisma();
    const captured = await captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/instances/00000000-0000-4000-8000-000000000001",
      {
        method: "DELETE",
        headers: { "x-request-id": "request-cap-approval" },
      },
    ));
    captured!.admission = [{
      actorId: "local-admin",
      capability: "CAP_AGENT_INSTANCE_DELETE",
      decision: "APPROVAL_REQUIRED",
      policyId: "builtin:governed-change",
      projectId: "individual",
      reason: "Agent deletion requires approval.",
      relation: "OWNER",
      resourceId: "00000000-0000-4000-8000-000000000001",
      resourceType: "AgentInstance",
      roleId: "ROLE_AGENT_DEVELOPER",
    }];

    await writeAuditResponse(
      captured!,
      new Response(JSON.stringify({ error: "Approval required." }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
      database,
    );

    const row = await database.auditLogRecord.findFirstOrThrow({
      where: { requestId: "request-cap-approval" },
    });
    expect(row).toMatchObject({
      authorizationCapability: "CAP_AGENT_INSTANCE_DELETE",
      authorizationDecision: "approval_required",
      authorizationReason: "Agent deletion requires approval.",
      authorizationRole: "ROLE_AGENT_DEVELOPER",
      outcome: "denied",
    });
    expect(row.metadata).toMatchObject({
      admission: [{
        capability: "CAP_AGENT_INSTANCE_DELETE",
        decision: "APPROVAL_REQUIRED",
        policyId: "builtin:governed-change",
        relation: "OWNER",
      }],
    });
  });

  it("keeps the primary route CAP searchable while retaining all admitted CAPs", async () => {
    database = createTestPrisma();
    const captured = await captureAuditRequest(new Request(
      "http://tali.local/api/v1/projects/individual/instances",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-multi-cap-primary",
        },
        body: JSON.stringify({ name: "Multi-cap Agent" }),
      },
    ));
    captured!.admission = [
      {
        actorId: "local-admin",
        capability: "CAP_AGENT_INSTANCE_CREATE",
        decision: "ALLOW",
        projectId: "individual",
        reason: "Primary route capability allowed.",
        relation: "OWNER",
        resourceType: "AgentInstance",
        roleId: "ROLE_AGENT_DEVELOPER",
      },
      {
        actorId: "local-admin",
        capability: "CAP_AGENT_INSTANCE_MODEL_ROUTING_ASSIGN",
        decision: "ALLOW",
        projectId: "individual",
        reason: "Additional binding capability allowed.",
        relation: "OWNER",
        resourceType: "AgentInstance",
        roleId: "ROLE_AGENT_DEVELOPER",
      },
    ];

    await writeAuditResponse(
      captured!,
      new Response(JSON.stringify({ id: "agent-multi", name: "Multi-cap Agent" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      database,
    );

    const row = await database.auditLogRecord.findFirstOrThrow({
      where: { requestId: "request-multi-cap-primary" },
    });
    expect(row).toMatchObject({
      authorizationCapability: "CAP_AGENT_INSTANCE_CREATE",
      authorizationDecision: "allowed",
      authorizationReason: "Primary route capability allowed.",
    });
    expect(row.metadata).toMatchObject({
      admission: [
        { capability: "CAP_AGENT_INSTANCE_CREATE", decision: "ALLOW" },
        {
          capability: "CAP_AGENT_INSTANCE_MODEL_ROUTING_ASSIGN",
          decision: "ALLOW",
        },
      ],
    });
  });
});
