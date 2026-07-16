import { AgentService } from "./agents/agent-service";
import { AgentStore } from "./data/agent-store";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";

const store = new AgentStore();
const litellm = new LiteLLMClient();
const agentService = new AgentService(store, undefined, litellm);
const providerService = new ProviderService(store, undefined, litellm);
const costService = new CostService(store, litellm);
let startup: Promise<void> | undefined;

export async function getAgentService(): Promise<AgentService> {
  startup ??= (async () => {
    await agentService.seedLocalDemo();
  })();
  await startup;
  return agentService;
}

export async function getProviderService(): Promise<ProviderService> {
  await getAgentService();
  return providerService;
}

export async function getCostService(): Promise<CostService> {
  await getAgentService();
  return costService;
}
