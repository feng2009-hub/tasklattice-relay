import { describe, expect, it } from "vitest";
import type { Instance as Agent } from "@tali/contracts";
import {
  instanceConfigurationView,
  instanceInteractionAccess,
  instanceRuntimeLogView,
} from "./instance-http-view";

function agent(): Agent {
  return {
    schemaVersion: 2,
    id: "11111111-1111-4111-8111-111111111111",
    name: "Research",
    description: "",
    runtime: "openshell",
    agentPlatform: "openclaw",
    policyId: "restricted",
    systemPrompt: "Research safely.",
    accessPolicyIds: ["default"],
    providerAccountId: "gateway",
    providerName: "LiteLLM",
    modelDeploymentId: "routing",
    model: "tali-routing-default",
    modelType: "llm",
    inferenceMode: "PLATFORM_MANAGED",
    modelRoutingId: "routing",
    modelRoutingBindingId: "binding",
    modelRoutingStatus: "READY",
    modelRoutingComplianceDomain: "GLOBAL",
    modelRoutingCapabilities: {
      automaticRouting: "ENABLED",
      routerType: "COMPLEXITY_ROUTER",
      complexityTierCount: 4,
      sessionAffinity: "ENABLED",
      adaptiveRouting: "DISABLED",
      failover: "ENABLED",
      generalFallback: "ENABLED",
      contextWindowFallback: "DISABLED",
      contentPolicyFallback: "DISABLED",
      retries: "ENABLED",
      requestAudit: "ENABLED",
    },
    modelRoutingKeyFingerprint: "token:fingerprint",
    costKeyAlias: "instance-key",
    sandboxName: "tali-research",
    status: "READY",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    logs: [
      "request authorization=Bearer-super-secret",
      "calling https://agent.example/?api_key=provider-secret&mode=test",
      "provider returned sk-plaintext-secret-value",
      "ordinary diagnostic retained",
    ],
    error: "runtime failed token='private-token' with private details",
    httpEndpoint: {
      kind: "openclaw-webui",
      status: "READY",
      url: "https://agent.example/#token=gateway-secret",
    },
  };
}

describe("Agent HTTP views", () => {
  it("never exposes the interaction URL through CONFIG_VIEW", () => {
    const view = instanceConfigurationView(agent());
    expect(view.httpEndpoint).toEqual({
      kind: "openclaw-webui",
      status: "READY",
    });
    expect(JSON.stringify(view)).not.toContain("gateway-secret");
    expect(view.logs).toEqual([]);
    expect(view.error).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("private details");
  });

  it("exposes the endpoint only in the dedicated interaction view", () => {
    expect(instanceInteractionAccess(agent())).toMatchObject({
      instanceId: "11111111-1111-4111-8111-111111111111",
      status: "READY",
      httpEndpoint: {
        url: "https://agent.example/#token=gateway-secret",
      },
    });
  });

  it("exposes runtime diagnostics only through the dedicated logs view", () => {
    expect(instanceRuntimeLogView(agent())).toEqual({
      instanceId: "11111111-1111-4111-8111-111111111111",
      logs: [
        "request authorization=[REDACTED]",
        "calling https://agent.example/?api_key=[REDACTED]&mode=test",
        "provider returned [REDACTED]",
        "ordinary diagnostic retained",
      ],
      error: "runtime failed token=[REDACTED] with private details",
    });
    expect(JSON.stringify(instanceRuntimeLogView(agent()))).not.toMatch(
      /super-secret|provider-secret|plaintext-secret|private-token/,
    );
  });
});
