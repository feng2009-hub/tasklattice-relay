import { afterEach, describe, expect, it, vi } from "vitest";
import { LiteLLMClient } from "./litellm-client";

afterEach(() => vi.unstubAllGlobals());

describe("LiteLLM Router capability inspection", () => {
  it("detects Auto Router and blocks versions before 1.94", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/model/info") ? {
        data: [{
          model_name: "production-chat",
          litellm_params: { model: "auto_router/auto-router-v2" },
          model_info: { compliance_domain: "CN_MAINLAND", fallbacks: ["backup"], request_audit: true },
        }],
      } : { version: "1.86.2" }), { status: 200 });
    }));
    const result = await new LiteLLMClient("http://litellm:4000", "master-secret").inspectModelProfile("production-chat");
    expect(result.capabilities).toMatchObject({ automaticRouting: "ENABLED", failover: "ENABLED", requestAudit: "ENABLED" });
    expect(result.unsupportedReason).toContain("1.94");
  });

  it("redacts virtual keys echoed by LiteLLM errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("failed sk-super-secret-value master-secret", { status: 500 })));
    await expect(new LiteLLMClient("http://litellm:4000", "master-secret").inspectModelProfile("production-chat"))
      .rejects.not.toThrow(/sk-super-secret-value|master-secret/);
  });

  it("resolves Auto Router tiers, advanced capabilities, and candidate compliance", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/model/info") ? {
        data: [
          {
            model_name: "production-chat",
            litellm_params: {
              model: "auto_router/complexity_router",
              complexity_router_config: {
                tiers: { SIMPLE: "fast", MEDIUM: "balanced", COMPLEX: "strong", REASONING: "reasoning" },
                adaptive: true,
              },
              context_window_fallbacks: [{ strong: ["reasoning"] }],
            },
            model_info: { request_audit: true },
          },
          { model_name: "fast", litellm_params: { model: "openai/fast" }, model_info: { compliance_domain: "GLOBAL" } },
          { model_name: "balanced", litellm_params: { model: "openai/balanced" }, model_info: { compliance_domain: "GLOBAL" } },
          { model_name: "strong", litellm_params: { model: "anthropic/strong" }, model_info: { compliance_domain: "CN_MAINLAND" } },
          { model_name: "reasoning", litellm_params: { model: "openai/reasoning" }, model_info: { compliance_domain: "GLOBAL" } },
        ],
      } : { version: "1.94.1" }), { status: 200 });
    }));

    const result = await new LiteLLMClient("http://litellm:4000", "master-secret").inspectModelProfile("production-chat");

    expect(result).toMatchObject({
      exists: true,
      modelCount: 4,
      complianceDomains: expect.arrayContaining(["CN_MAINLAND", "GLOBAL"]),
      complianceUnknown: false,
      capabilities: {
        automaticRouting: "ENABLED",
        routerType: "COMPLEXITY_ROUTER",
        complexityTierCount: 4,
        sessionAffinity: "ENABLED",
        adaptiveRouting: "ENABLED",
        contextWindowFallback: "ENABLED",
        requestAudit: "ENABLED",
      },
    });
    expect(result.configurationHash).toMatch(/^sha256:/);
  });

  it("creates a model-restricted Team key with compliance metadata", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(bodies.length === 1
        ? { team_id: "team-a" }
        : { key: "sk-instance-secret", token: "token-a" }), { status: 200 });
    }));
    const client = new LiteLLMClient("http://litellm:4000", "master-secret");

    const teamId = await client.createModelProfileTeam({
      alias: "tasklattice-profile-a",
      modelAlias: "production-chat",
      modelProfileId: "profile-a",
      complianceDomain: "GLOBAL",
    });
    const key = await client.createModelProfileKey({
      agentId: "agent-a",
      alias: "tasklattice/profile-a/agent-a",
      modelAlias: "production-chat",
      teamId,
      modelProfileId: "profile-a",
      complianceDomain: "GLOBAL",
    });

    expect(key).toEqual({ secret: "sk-instance-secret", tokenId: "token-a" });
    expect(bodies).toEqual([
      expect.objectContaining({
        models: ["production-chat"],
        metadata: expect.objectContaining({ model_profile_id: "profile-a", compliance_domain: "GLOBAL" }),
      }),
      expect.objectContaining({
        team_id: "team-a",
        user_id: "agent-a",
        models: ["production-chat"],
        metadata: expect.objectContaining({ model_profile_id: "profile-a", agent_id: "agent-a", compliance_domain: "GLOBAL" }),
      }),
    ]);
  });
});

describe("LiteLLM spend logs", () => {
  it("includes the requested end day by sending LiteLLM the next exclusive date", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify([
      {
        request_id: "request-today",
        request_start_time: "2026-07-23T09:30:03.402Z",
        spend: 0.01,
      },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const logs = await new LiteLLMClient("http://litellm:4000", "master-secret")
      .listSpendLogs("2026-07-01", "2026-07-23");

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("start_date")).toBe("2026-07-01");
    expect(requestedUrl.searchParams.get("end_date")).toBe("2026-07-24");
    expect(requestedUrl.searchParams.get("summarize")).toBe("false");
    expect(logs).toEqual([
      expect.objectContaining({
        request_id: "request-today",
        spend: 0.01,
      }),
    ]);
  });
});
