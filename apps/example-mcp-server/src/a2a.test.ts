import { describe, expect, it } from "vitest";
import {
  createDemoAgentCard,
  getDemoA2aAgent,
  runDemoA2aMessage,
} from "./a2a.js";

describe("demo-test A2A runtime", () => {
  it("publishes a card for the selected Agent and its Pod endpoint", () => {
    expect(createDemoAgentCard(
      "a2a-github-daily-triage",
      "http://tali-a2a-example.project.svc.cluster.local:3000/",
    )).toMatchObject({
      name: "GitHub Daily Triage",
      supportedInterfaces: [{
        url: "http://tali-a2a-example.project.svc.cluster.local:3000",
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      }],
      skills: [
        { id: "daily-repository-triage" },
        { id: "prepare-engineering-handoff" },
      ],
    });
  });

  it("runs the selected Agent as an independent A2A service", () => {
    const response = runDemoA2aMessage("a2a-pull-request-risk-scanner", {
      jsonrpc: "2.0",
      id: "request-1",
      method: "SendMessage",
      params: {
        message: {
          messageId: "message-1",
          role: "ROLE_USER",
          parts: [{ text: "Assess PR #142." }],
        },
      },
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "request-1",
      result: {
        message: {
          role: "ROLE_AGENT",
          metadata: {
            agentId: "a2a-pull-request-risk-scanner",
            trace: ["Agent Card", "Inspect change", "Score risk", "Recommend gates"],
          },
        },
      },
    });
    expect(response.result.message.parts[0]?.text).toContain("Risk: Medium");
  });

  it("rejects an unknown startup Agent", () => {
    expect(() => getDemoA2aAgent("missing-agent")).toThrow(
      "Unknown demo A2A Agent",
    );
  });
});
