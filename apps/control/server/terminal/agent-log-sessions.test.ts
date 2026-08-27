import { describe, expect, it } from "vitest";
import {
  consumeAgentLogSession,
  createAgentLogSession,
} from "./agent-log-sessions";

describe("Agent log sessions", () => {
  it("binds a single-use read-only WebSocket capability to its Project and Instance", () => {
    const created = createAgentLogSession(
      "web3 analytics",
      "c70149f6-7dc5-40e2-b0d3-4f2f548ea728",
      { tailLines: 300, timestamps: true, previous: false },
    );
    const url = new URL(created.websocketUrl, "http://tali.local");
    const token = url.searchParams.get("token") ?? "";

    expect(url.pathname).toBe(
      `/api/v1/projects/web3%20analytics/agent-log-sessions/${created.id}/ws`,
    );
    expect(consumeAgentLogSession(created.id, token)).toMatchObject({
      projectId: "web3 analytics",
      instanceId: "c70149f6-7dc5-40e2-b0d3-4f2f548ea728",
      options: { tailLines: 300, timestamps: true, previous: false },
    });
    expect(consumeAgentLogSession(created.id, token)).toBeUndefined();
  });
});
