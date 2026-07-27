import { AgentService } from "./agents/agent-service";
import { AgentGardenService } from "./agent-garden/agent-garden-service";
import { AgentGardenStore } from "./agent-garden/agent-garden-store";
import { AccessPolicyService } from "./access-policies/access-policy-service";
import { AccessPolicyStore } from "./access-policies/access-policy-store";
import { ResourceCatalogService } from "./catalog/resource-catalog-service";
import { ModelProfileService } from "./model-profiles/model-profile-service";
import { PolicyService } from "./policies/policy-service";
import { ProjectStore } from "./projects/project-store";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";
import { ProjectService, type ProjectRole } from "./projects/project-service";
import { VirtualEmployeeService } from "./virtual-employees/virtual-employee-service";
import { VirtualEmployeeStore } from "./virtual-employees/virtual-employee-store";
import { ProjectQuotaService } from "./quotas/project-quota-service";
import { AuditLogService } from "./audit-logs/audit-log-service";

interface ProjectServices {
  agent: AgentService;
  agentGarden: AgentGardenService;
  accessPolicies: AccessPolicyService;
  cost: CostService;
  catalog: ResourceCatalogService;
  modelProfiles: ModelProfileService;
  policies: PolicyService;
  provider: ProviderService;
  virtualEmployees: VirtualEmployeeService;
  quotas: ProjectQuotaService;
  auditLogs: AuditLogService;
}

const litellm = new LiteLLMClient();
const projectService = new ProjectService();
const services = new Map<string, ProjectServices>();
const reconciliationTimers = new Map<string, NodeJS.Timeout>();

function createServices(projectId: string): ProjectServices {
  const store = new ProjectStore(projectId);
  const policies = new PolicyService(store);
  const modelProfiles = new ModelProfileService(store, litellm);
  const quotas = new ProjectQuotaService(store, litellm);
  const catalog = new ResourceCatalogService(store, quotas, litellm);
  const virtualEmployees = new VirtualEmployeeService(new VirtualEmployeeStore(projectId), litellm);
  const accessPolicies = new AccessPolicyService(
    new AccessPolicyStore(projectId, store.database()),
    store,
    litellm,
  );
  scheduleVirtualEmployeeReconciliation(projectId, virtualEmployees);
  return {
    auditLogs: new AuditLogService(projectId, store.database()),
    agent: new AgentService(store, undefined, litellm, policies, catalog, modelProfiles, virtualEmployees, quotas, accessPolicies),
    agentGarden: new AgentGardenService(
      new AgentGardenStore(projectId, store.database()),
      store,
    ),
    accessPolicies,
    provider: new ProviderService(store, litellm),
    cost: new CostService(store, litellm),
    policies,
    catalog,
    modelProfiles,
    virtualEmployees,
    quotas,
  };
}

function scheduleVirtualEmployeeReconciliation(
  projectId: string,
  virtualEmployees: VirtualEmployeeService,
): void {
  if (reconciliationTimers.has(projectId)) return;
  const intervalMs = 300_000;
  const timer = setInterval(() => {
    void virtualEmployees.reconcileAll().catch((error) => {
      console.error("Virtual Employee reconciliation failed.", error);
    });
  }, intervalMs);
  timer.unref();
  reconciliationTimers.set(projectId, timer);
}

async function forRequest(request?: Request): Promise<ProjectServices> {
  const projectId = request
    ? (await projectService.resolve(request)).projectId
    : "individual";
  return forProject(projectId);
}

function forProject(projectId: string): ProjectServices {
  let scoped = services.get(projectId);
  if (!scoped) {
    scoped = createServices(projectId);
    services.set(projectId, scoped);
  }
  return scoped;
}

export async function requireProjectRole(
  request: Request,
  roles: ProjectRole[],
): Promise<void> {
  const context = await projectService.resolve(request);
  if (!roles.includes(context.role)) {
    throw new Error("You do not have permission to perform this project action.");
  }
}

export async function getAgentService(request?: Request): Promise<AgentService> {
  return (await forRequest(request)).agent;
}

export function getAgentServiceForProject(projectId: string): AgentService {
  return forProject(projectId).agent;
}

export async function getAgentGardenService(
  request?: Request,
): Promise<AgentGardenService> {
  return (await forRequest(request)).agentGarden;
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

export async function getResourceCatalogService(request?: Request): Promise<ResourceCatalogService> {
  return (await forRequest(request)).catalog;
}

export async function getModelProfileService(request?: Request): Promise<ModelProfileService> {
  return (await forRequest(request)).modelProfiles;
}

export async function getVirtualEmployeeService(request?: Request): Promise<VirtualEmployeeService> {
  return (await forRequest(request)).virtualEmployees;
}

export async function getProjectQuotaService(request?: Request): Promise<ProjectQuotaService> {
  return (await forRequest(request)).quotas;
}

export async function getAccessPolicyService(request?: Request): Promise<AccessPolicyService> {
  return (await forRequest(request)).accessPolicies;
}

export async function getAuditLogService(request?: Request): Promise<AuditLogService> {
  return (await forRequest(request)).auditLogs;
}
