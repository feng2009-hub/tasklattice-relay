import { WebSocket } from "ws";

export interface TerminalInputSocket {
  readyState: number;
  send(input: string): void;
  close(): void;
  terminate(): void;
}

export class BufferedTerminalInput {
  private pending: string[] = [];
  private upstream: TerminalInputSocket | undefined;

  attach(upstream: TerminalInputSocket): void {
    this.upstream = upstream;
  }

  write(input: string): void {
    if (this.upstream?.readyState === WebSocket.OPEN) this.upstream.send(input);
    else this.pending.push(input);
  }

  flush(): void {
    if (this.upstream?.readyState !== WebSocket.OPEN) return;
    for (const input of this.pending.splice(0)) this.upstream.send(input);
  }

  close(): void {
    const upstream = this.upstream;
    this.pending.length = 0;
    this.upstream = undefined;
    if (upstream?.readyState === WebSocket.CONNECTING) upstream.terminate();
    else if (upstream?.readyState === WebSocket.OPEN) upstream.close();
  }
}
