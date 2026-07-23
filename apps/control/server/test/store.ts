import { AgentStore } from "../data/agent-store";
import { createTestPrisma } from "./prisma";

export function createTestStore(workspaceId = "individual"): AgentStore {
  return new AgentStore(workspaceId, createTestPrisma());
}
