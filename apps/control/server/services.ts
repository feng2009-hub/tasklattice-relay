import { AgentService } from "./agents/agent-service";
import { AgentStore } from "./data/agent-store";
import { ExtensionCatalogService } from "./extensions/extension-catalog-service";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";
import { PolicyService } from "./policies/policy-service";
import { InferenceGroupService } from "./inference-groups/inference-group-service";

const store = new AgentStore();
const litellm = new LiteLLMClient();
const policyService = new PolicyService(store);
const inferenceGroupService = new InferenceGroupService(store, litellm);
const agentService = new AgentService(store, undefined, litellm, policyService, undefined, inferenceGroupService);
const providerService = new ProviderService(store, undefined, litellm);
const costService = new CostService(store, litellm);
const extensionCatalogService = new ExtensionCatalogService(store);

export async function getAgentService(): Promise<AgentService> {
  return agentService;
}

export async function getProviderService(): Promise<ProviderService> {
  await getAgentService();
  return providerService;
}

export async function getCostService(): Promise<CostService> {
  return costService;
}

export async function getPolicyService(): Promise<PolicyService> {
  return policyService;
}

export async function getExtensionCatalogService(): Promise<ExtensionCatalogService> {
  return extensionCatalogService;
}

export async function getInferenceGroupService(): Promise<InferenceGroupService> {
  return inferenceGroupService;
}
