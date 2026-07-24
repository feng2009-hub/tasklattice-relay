import { describe, expect, it } from "vitest";
import {
  consumeTerminalSession,
  createTerminalSession,
} from "./terminal-sessions";

describe("terminal sessions", () => {
  it("binds the one-time WebSocket URL to its project context", () => {
    const created = createTerminalSession(
      "web3 analytics",
      "agent-id",
      "sandbox-name",
      "openclaw",
      "primary",
    );
    const url = new URL(created.websocketUrl, "http://tasklattice.local");
    const token = url.searchParams.get("token");

    expect(url.searchParams.get("project_id")).toBe("web3 analytics");
    expect(token).toBeTruthy();
    expect(
      consumeTerminalSession(created.id, token ?? ""),
    ).toMatchObject({
      projectId: "web3 analytics",
      agentId: "agent-id",
      targetId: "primary",
    });
  });
});
