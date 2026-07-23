import { AgentService } from "./agents/agent-service";
import { AgentStore } from "./data/agent-store";
import { ExtensionCatalogService } from "./extensions/extension-catalog-service";
import { InferenceGroupService } from "./inference-groups/inference-group-service";
import { PolicyService } from "./policies/policy-service";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";
import { WorkspaceService, type WorkspaceRole } from "./workspaces/workspace-service";

interface WorkspaceServices {
  agent: AgentService;
  cost: CostService;
  extensions: ExtensionCatalogService;
  inferenceGroups: InferenceGroupService;
  policies: PolicyService;
  provider: ProviderService;
}

const litellm = new LiteLLMClient();
const workspaceService = new WorkspaceService();
const services = new Map<string, WorkspaceServices>();

function createServices(workspaceId: string): WorkspaceServices {
  const store = new AgentStore(workspaceId);
  const policies = new PolicyService(store);
  const inferenceGroups = new InferenceGroupService(store, litellm);
  const extensions = new ExtensionCatalogService(store);
  return {
    agent: new AgentService(store, undefined, litellm, policies, extensions, inferenceGroups),
    provider: new ProviderService(store, undefined, litellm),
    cost: new CostService(store, litellm),
    policies,
    extensions,
    inferenceGroups,
  };
}

async function forRequest(request?: Request): Promise<WorkspaceServices> {
  const workspaceId = request
    ? (await workspaceService.resolve(request)).workspaceId
    : process.env.TALI_BOOTSTRAP_WORKSPACE_ID ?? "individual";
  let scoped = services.get(workspaceId);
  if (!scoped) {
    scoped = createServices(workspaceId);
    services.set(workspaceId, scoped);
  }
  return scoped;
}

export async function requireWorkspaceRole(
  request: Request,
  roles: WorkspaceRole[],
): Promise<void> {
  const context = await workspaceService.resolve(request);
  if (!roles.includes(context.role)) {
    throw new Error("You do not have permission to perform this workspace action.");
  }
}

export async function getAgentService(request?: Request): Promise<AgentService> {
  return (await forRequest(request)).agent;
}

export async function getProviderService(request?: Request): Promise<ProviderService> {
  return (await forRequest(request)).provider;
}

export async function getCostService(request?: Request): Promise<CostService> {
  return (await forRequest(request)).cost;
}

export async function getPolicyService(request?: Request): Promise<PolicyService> {
  return (await forRequest(request)).policies;
}

export async function getExtensionCatalogService(request?: Request): Promise<ExtensionCatalogService> {
  return (await forRequest(request)).extensions;
}

export async function getInferenceGroupService(request?: Request): Promise<InferenceGroupService> {
  return (await forRequest(request)).inferenceGroups;
}
