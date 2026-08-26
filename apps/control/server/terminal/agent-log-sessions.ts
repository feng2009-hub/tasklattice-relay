import { randomUUID } from "node:crypto";
import type {
  AgentInstanceLogSessionResponse,
  CreateInstanceLogSessionInput,
} from "@tali/contracts";

export interface AgentLogSessionRecord {
  projectId: string;
  instanceId: string;
  options: CreateInstanceLogSessionInput;
  expiresAt: number;
}

const sessions = new Map<string, AgentLogSessionRecord>();

export function createAgentLogSession(
  projectId: string,
  instanceId: string,
  options: CreateInstanceLogSessionInput,
): AgentInstanceLogSessionResponse {
  const id = randomUUID();
  const token = randomUUID();
  const expiresAt = Date.now() + 5 * 60_000;
  sessions.set(`${id}:${token}`, {
    projectId,
    instanceId,
    options,
    expiresAt,
  });
  return {
    id,
    expiresAt: new Date(expiresAt).toISOString(),
    websocketUrl:
      `/api/v1/projects/${encodeURIComponent(projectId)}`
      + `/agent-log-sessions/${id}/ws?token=${token}`,
  };
}

export function consumeAgentLogSession(
  id: string,
  token: string,
): AgentLogSessionRecord | undefined {
  const key = `${id}:${token}`;
  const session = sessions.get(key);
  sessions.delete(key);
  return session && session.expiresAt >= Date.now() ? session : undefined;
}
