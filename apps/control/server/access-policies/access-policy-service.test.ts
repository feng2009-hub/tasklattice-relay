import { describe, expect, it, vi } from "vitest";
import {
  createAccessPolicySchema,
  updateAccessPolicySchema,
  type AccessPolicy,
  type McpServerDefinition,
} from "@tasklattice/contracts";

import type { LiteLLMAdminClient } from "../providers/litellm-client";
import { createTestStore } from "../test/store";
import { AccessPolicyService, effectiveInstanceObjectPermissions } from "./access-policy-service";
import { AccessPolicyStore } from "./access-policy-store";

const employeeId = "11111111-1111-4111-8111-111111111111";
const discoveredAt = "2026-07-25T00:00:00.000Z";
const server: McpServerDefinition = {
  id: "documents",
  litellmServerId: "litellm-documents",
  name: "Documents",
  alias: "documents",
  description: "Search and mutate the approved document collection.",
  category: "Knowledge",
  transport: "http",
  endpoint: "https://mcp.example.test/mcp",
  authType: "none",
  authReference: "",
  args: [],
  environment: [],
  accessGroups: ["knowledge"],
  allowedTools: [],
  extraHeaders: [],
  staticHeaders: [],
  internalNetworkOnly: true,
  status: "HEALTHY",
  tools: [
    { name: "search", inputSchema: {}, discoveredAt },
    { name: "delete", inputSchema: {}, discoveredAt },
  ],
  lastDiscoveryAttemptAt: discoveredAt,
  lastDiscoveredAt: discoveredAt,
  lastDiscoveryError: null,
};

function policy(overrides: Partial<AccessPolicy>): AccessPolicy {
  return {
    id: "policy-a",
    name: "Document access",
    status: "ACTIVE",
    virtualEmployeeIds: [employeeId],
    serverRules: [{
      mcpServerId: server.id,
      defaultDecision: "DENY",
      tools: [{ toolName: "search", decision: "ALLOW" }],
    }],
    revision: 1,
    createdBy: "Test Admin",
    createdAt: discoveredAt,
    updatedAt: discoveredAt,
    ...overrides,
  };
}

function adapter(): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm.test",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(),
    revokeKey: vi.fn(),
    listSpendLogs: vi.fn(async () => []),
    updateInstanceObjectPermissions: vi.fn(async () => undefined),
  };
}

describe("Access Policy enforcement", () => {
  it("accepts permission rules without policy description metadata", () => {
    expect(createAccessPolicySchema.parse({
      name: "Research read-only",
      serverRules: [{
        mcpServerId: server.id,
        defaultDecision: "DENY",
        tools: [{ toolName: "search", decision: "ALLOW" }],
      }],
    })).toEqual({
      name: "Research read-only",
      status: "DRAFT",
      virtualEmployeeIds: [],
      serverRules: [{
        mcpServerId: server.id,
        defaultDecision: "DENY",
        tools: [{ toolName: "search", decision: "ALLOW" }],
      }],
    });
  });

  it("does not inject create defaults into a partial status update", () => {
    expect(updateAccessPolicySchema.parse({ status: "DRAFT" })).toEqual({
      status: "DRAFT",
    });
  });

  it("denies by default and gives deny precedence across active policies", () => {
    const permissions = effectiveInstanceObjectPermissions(
      employeeId,
      [server],
      [],
      [
        policy({
          serverRules: [{
            mcpServerId: server.id,
            defaultDecision: "ALLOW",
            tools: [{ toolName: "search", decision: "ALLOW" }],
          }],
        }),
        policy({
          id: "policy-b",
          name: "Emergency restriction",
          serverRules: [{
            mcpServerId: server.id,
            defaultDecision: "ALLOW",
            tools: [{ toolName: "search", decision: "DENY" }],
          }],
        }),
      ],
    );

    expect(permissions).toEqual({
      mcpServers: ["litellm-documents"],
      mcpAccessGroups: ["knowledge"],
      mcpToolPermissions: { "litellm-documents": ["delete"] },
      vectorStores: [],
    });
  });

  it("returns an empty MCP scope when no active policy is bound", () => {
    expect(effectiveInstanceObjectPermissions(employeeId, [server], [], [
      policy({ status: "DRAFT" }),
    ])).toMatchObject({
      mcpServers: [],
      mcpToolPermissions: {},
    });
  });

  it("persists revisions and validates discovered tool references", async () => {
    const projects = createTestStore();
    await projects.saveMcpServerDefinition(server);
    await projects.saveMcpDiscovery(server.id, {
      status: "HEALTHY",
      attemptedAt: discoveredAt,
      discoveredAt,
      tools: server.tools,
    });
    await projects.database().virtualEmployeeRecord.create({
      data: {
        projectId: projects.projectId,
        id: employeeId,
        name: "research-worker",
        displayName: "Research Worker",
        environment: "production",
        status: "active",
        tags: [],
        createdBy: "Test Admin",
      },
    });
    const litellm = adapter();
    const store = new AccessPolicyStore(projects.projectId, projects.database());
    const service = new AccessPolicyService(store, projects, litellm);
    const created = await service.create({
      name: "Research read-only",
      status: "DRAFT",
      virtualEmployeeIds: [employeeId],
      serverRules: [{
        mcpServerId: server.id,
        defaultDecision: "DENY",
        tools: [{ toolName: "search", decision: "ALLOW" }],
      }],
    }, "Test Admin");
    await projects.database().agentRecord.create({
      data: {
        projectId: projects.projectId,
        id: "instance-a",
        createdAt: discoveredAt,
        payload: {
          schemaVersion: 1,
          id: "instance-a",
          name: "Research Instance",
          sandboxName: "tali-research",
          model: "production-chat",
          systemPrompt: "Research approved documents and report the evidence.",
          createdAt: discoveredAt,
          updatedAt: discoveredAt,
          logs: [],
          inferenceMode: "PLATFORM_MANAGED",
          modelProfileId: "profile-a",
          modelProfileBindingId: "binding-a",
          modelProfileKeyFingerprint: "token:instance-a",
          modelProfileCapabilities: {
            automaticRouting: "ENABLED",
            routerType: "COMPLEXITY_ROUTER",
            sessionAffinity: "ENABLED",
            adaptiveRouting: "DISABLED",
            failover: "ENABLED",
            generalFallback: "ENABLED",
            contextWindowFallback: "DISABLED",
            contentPolicyFallback: "DISABLED",
            retries: "ENABLED",
            requestAudit: "ENABLED",
          },
          modelProfileComplianceDomain: "GLOBAL",
          modelProfileStatus: "READY",
          virtualEmployeeId: employeeId,
          mcpServerIds: [server.id],
          knowledgeSourceIds: [],
          liteLLMTokenId: "instance-token-a",
        },
      },
    });
    const updated = await service.update(created.id, { status: "ACTIVE" }, "Security Admin");

    expect(updated.revision).toBe(2);
    expect(litellm.updateInstanceObjectPermissions).toHaveBeenCalledWith(
      "instance-token-a",
      {
        mcpServers: ["litellm-documents"],
        mcpAccessGroups: ["knowledge"],
        mcpToolPermissions: { "litellm-documents": ["search"] },
        vectorStores: [],
      },
    );
    expect((await service.versions(created.id)).map((version) => version.revision)).toEqual([2, 1]);
    await expect(service.update(created.id, {
      serverRules: [{
        mcpServerId: server.id,
        defaultDecision: "DENY",
        tools: [{ toolName: "unknown_tool", decision: "ALLOW" }],
      }],
    }, "Test Admin")).rejects.toThrow("not found");
  });
});
