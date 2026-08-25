import { describe, expect, it, vi } from "vitest";
import {
  BufferedTerminalInput,
  type TerminalInputSocket,
} from "./buffered-terminal-input";

function socket(readyState: number) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
  } satisfies TerminalInputSocket;
}

describe("BufferedTerminalInput", () => {
  it("preserves input received before the upstream WebSocket opens", () => {
    const input = new BufferedTerminalInput();
    const upstream = socket(0);

    input.write("initial resize");
    input.attach(upstream);
    input.write("early keystroke");
    input.flush();
    expect(upstream.send).not.toHaveBeenCalled();

    upstream.readyState = 1;
    input.flush();
    expect(upstream.send.mock.calls).toEqual([
      ["initial resize"],
      ["early keystroke"],
    ]);
  });

  it("forwards new input immediately after the upstream opens", () => {
    const input = new BufferedTerminalInput();
    const upstream = socket(1);
    input.attach(upstream);

    input.write("input");

    expect(upstream.send).toHaveBeenCalledWith("input");
  });

  it("terminates an upstream that is still connecting", () => {
    const input = new BufferedTerminalInput();
    const upstream = socket(0);
    input.attach(upstream);

    input.close();

    expect(upstream.terminate).toHaveBeenCalledOnce();
    expect(upstream.close).not.toHaveBeenCalled();
  });
});
