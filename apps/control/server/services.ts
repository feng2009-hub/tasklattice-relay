import { AgentService } from "./agents/agent-service";
import { AgentGardenService } from "./agent-garden/agent-garden-service";
import { AgentGardenStore } from "./agent-garden/agent-garden-store";
import { AccessPolicyService } from "./access-policies/access-policy-service";
import { AccessPolicyStore } from "./access-policies/access-policy-store";
import { ResourceCatalogService } from "./catalog/resource-catalog-service";
import { ModelRoutingService } from "./model-routings/model-routing-service";
import { PolicyService } from "./policies/policy-service";
import { ProjectStore } from "./projects/project-store";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";
import { ProjectService, type ProjectRole } from "./projects/project-service";
import { ProjectQuotaService } from "./quotas/project-quota-service";
import { AuditLogService } from "./audit-logs/audit-log-service";
import { ProjectOverviewService } from "./overview/project-overview-service";
import type {
  ProjectCapability,
  ResourceRelation,
} from "@tali/contracts";
import {
  ProjectAdmissionService,
  type AdmissionResult,
} from "./authorization/admission-control";
import {
  appendAdmissionEvidence,
  isProjectAdmissionComplete,
} from "./authorization/authorization-context";

interface ProjectServices {
  agent: AgentService;
  agentGarden: AgentGardenService;
  accessPolicies: AccessPolicyService;
  cost: CostService;
  catalog: ResourceCatalogService;
  modelRoutings: ModelRoutingService;
  policies: PolicyService;
  provider: ProviderService;
  quotas: ProjectQuotaService;
  auditLogs: AuditLogService;
  overview: ProjectOverviewService;
}

const litellm = new LiteLLMClient();
const projectService = new ProjectService();
const projectAdmissionService = new ProjectAdmissionService();
const services = new Map<string, ProjectServices>();

function createServices(projectId: string): ProjectServices {
  const store = new ProjectStore(projectId);
  const policies = new PolicyService(store);
  const modelRoutings = new ModelRoutingService(store, litellm);
  const quotas = new ProjectQuotaService(store, litellm);
  const catalog = new ResourceCatalogService(store, quotas, litellm);
  const accessPolicies = new AccessPolicyService(
    new AccessPolicyStore(projectId, store.database()),
    store,
    litellm,
  );
  const agent = new AgentService(
    store,
    undefined,
    litellm,
    policies,
    catalog,
    modelRoutings,
    quotas,
    accessPolicies,
  );
  return {
    auditLogs: new AuditLogService(projectId, store.database()),
    agent,
    overview: new ProjectOverviewService(store, agent),
    agentGarden: new AgentGardenService(
      new AgentGardenStore(projectId, store.database()),
      store,
    ),
    accessPolicies,
    provider: new ProviderService(store, litellm),
    cost: new CostService(store, litellm),
    policies,
    catalog,
    modelRoutings,
    quotas,
  };
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
  if (isProjectAdmissionComplete(request)) return;
  const context = await projectService.resolve(request);
  if (!roles.includes(context.role)) {
    throw new Error("You do not have permission to perform this project action.");
  }
}

export interface ProjectCapabilityOptions {
  relation?: ResourceRelation;
  resourceId?: string;
  resourceType: string;
}

export async function requireProjectCapability(
  request: Request,
  capability: ProjectCapability,
  options: ProjectCapabilityOptions,
): Promise<AdmissionResult> {
  const { userId } = await projectService.authenticate(request);
  return projectAdmissionService.authorize(
    request,
    userId,
    capability,
    {
      ...options,
    },
  );
}

/**
 * Project creation is a system-scoped entitlement, not a permission inherited
 * from whichever Project happens to be selected in the UI. Every active,
 * authenticated user currently receives it explicitly.
 */
export async function requireProjectCreateCapability(
  request: Request,
): Promise<void> {
  const { userId } = await projectService.authenticate(request);
  appendAdmissionEvidence(request, {
    actorId: userId,
    capability: "CAP_PROJECT_CREATE",
    decision: "ALLOW",
    environment: "DEV",
    projectId: "system",
    reason: "Active authenticated users receive the system Project-create entitlement.",
    relation: "PROJECT_ANY",
    resourceType: "Project",
  });
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

export async function getModelRoutingService(request?: Request): Promise<ModelRoutingService> {
  return (await forRequest(request)).modelRoutings;
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

export async function getProjectOverviewService(request?: Request): Promise<ProjectOverviewService> {
  return (await forRequest(request)).overview;
}
