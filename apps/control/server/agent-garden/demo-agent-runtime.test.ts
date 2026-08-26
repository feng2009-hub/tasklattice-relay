import { describe, expect, it, vi } from "vitest";
import {
  demoAgentCard,
  demoAgentDefinitions,
  demoAgentEndpoint,
  hermesMvpA2aAgentIds,
  runDemoAgentMessage,
} from "./demo-agent-runtime";

describe("demo Agent runtime", () => {
  it("uses the deployed Control Service origin for callable examples", () => {
    vi.stubEnv(
      "TALI_BOOTSTRAP_INTERNAL_URL",
      "http://tali-relay-control.tali.svc.cluster.local:38080/",
    );
    expect(demoAgentEndpoint("a2a-github-daily-triage")).toBe(
      "http://tali-relay-control.tali.svc.cluster.local:38080/api/v1/demo-agents/a2a-github-daily-triage",
    );
    vi.unstubAllEnvs();
  });

  it("publishes the database-backed example store and runtime demos", () => {
    expect(
      demoAgentDefinitions.filter(
        (agent) => agent.integrationType === "a2a",
      ),
    ).toHaveLength(16);
    expect(
      demoAgentDefinitions.filter(
        (agent) => agent.catalogKind === "EXAMPLE_BLUEPRINT",
      ),
    ).toHaveLength(12);
  });

  it("publishes an Agent Card with callable skills", () => {
    const card = demoAgentCard("a2a-github-daily-triage");
    expect(card).toMatchObject({
      name: "GitHub Daily Triage",
      capabilities: { streaming: false },
    });
    expect(card.supportedInterfaces[0]).toMatchObject({
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    });
    expect(card.skills.map((skill) => skill.id)).toContain(
      "daily-repository-triage",
    );
  });

  it("selects two standard A2A examples for the Hermes MVP", () => {
    expect(hermesMvpA2aAgentIds).toEqual([
      "a2a-github-daily-triage",
      "a2a-pull-request-risk-scanner",
    ]);
    expect(
      hermesMvpA2aAgentIds.map((id) =>
        demoAgentDefinitions.find((agent) => agent.id === id)?.platformLabel
      ),
    ).toEqual(["A2A Standard", "A2A Standard"]);
  });

  it("returns a deterministic A2A message with an interaction trace", () => {
    const response = runDemoAgentMessage(
      "langgraph-support-escalation-router",
      {
        jsonrpc: "2.0",
        id: "preview-1",
        method: "SendMessage",
        params: {
          message: {
            messageId: "message-1",
            role: "ROLE_USER",
            parts: [
              {
                text: "Route an enterprise billing outage.",
              },
            ],
          },
        },
      },
    );

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "preview-1",
      result: {
        message: {
          role: "ROLE_AGENT",
          metadata: {
            demo: true,
            protocol: "A2A 1.0",
            framework: "LangGraph",
            trace: [
              "Classify",
              "Policy check",
              "Approval gate",
              "Response handoff",
            ],
          },
        },
      },
    });
    expect(response.result.message.parts[0]?.text).toContain(
      "LangGraph workflow preview",
    );
  });
});
