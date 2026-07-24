import { AgentService } from "./agents/agent-service";
import { AgentStore } from "./data/agent-store";
import { ExtensionCatalogService } from "./extensions/extension-catalog-service";
import { ModelProfileService } from "./model-profiles/model-profile-service";
import { PolicyService } from "./policies/policy-service";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";
import { WorkspaceService, type WorkspaceRole } from "./workspaces/workspace-service";
import { VirtualEmployeeService } from "./virtual-employees/virtual-employee-service";
import { VirtualEmployeeStore } from "./virtual-employees/virtual-employee-store";

interface WorkspaceServices {
  agent: AgentService;
  cost: CostService;
  extensions: ExtensionCatalogService;
  modelProfiles: ModelProfileService;
  policies: PolicyService;
  provider: ProviderService;
  virtualEmployees: VirtualEmployeeService;
}

const litellm = new LiteLLMClient();
const workspaceService = new WorkspaceService();
const services = new Map<string, WorkspaceServices>();
const reconciliationTimers = new Map<string, NodeJS.Timeout>();

function createServices(workspaceId: string): WorkspaceServices {
  const store = new AgentStore(workspaceId);
  const policies = new PolicyService(store);
  const modelProfiles = new ModelProfileService(store, litellm);
  const extensions = new ExtensionCatalogService(store);
  const virtualEmployees = new VirtualEmployeeService(new VirtualEmployeeStore(workspaceId), litellm);
  scheduleVirtualEmployeeReconciliation(workspaceId, virtualEmployees);
  return {
    agent: new AgentService(store, undefined, litellm, policies, extensions, modelProfiles, virtualEmployees),
    provider: new ProviderService(store, undefined, litellm),
    cost: new CostService(store, litellm),
    policies,
    extensions,
    modelProfiles,
    virtualEmployees,
  };
}

function scheduleVirtualEmployeeReconciliation(
  workspaceId: string,
  virtualEmployees: VirtualEmployeeService,
): void {
  if (process.env.LITELLM_SYNC_ENABLED !== "true" || reconciliationTimers.has(workspaceId)) return;
  const configured = Number(process.env.LITELLM_SYNC_INTERVAL_MS ?? 300_000);
  const intervalMs = Number.isFinite(configured) && configured >= 60_000 ? configured : 300_000;
  const timer = setInterval(() => {
    void virtualEmployees.reconcileAll().catch((error) => {
      console.error("Virtual Employee reconciliation failed.", error);
    });
  }, intervalMs);
  timer.unref();
  reconciliationTimers.set(workspaceId, timer);
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
    throw new Error("You do not have permission to perform this project action.");
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

export async function getModelProfileService(request?: Request): Promise<ModelProfileService> {
  return (await forRequest(request)).modelProfiles;
}

export async function getVirtualEmployeeService(request?: Request): Promise<VirtualEmployeeService> {
  return (await forRequest(request)).virtualEmployees;
}
