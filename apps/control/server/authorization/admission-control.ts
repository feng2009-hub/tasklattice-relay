import type {
  AuthorizationDecision,
  BuiltinProjectRoleId,
  DeploymentEnvironment,
  ProjectCapability,
  ResourceRelation,
} from "@tali/contracts";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { appendAdmissionEvidence, type AdmissionEvidence } from "./authorization-context";
import {
  builtinRole,
  membershipRoleToBuiltinRole,
} from "./builtin-roles";

export interface AdmissionInput {
  actorId: string;
  capability: ProjectCapability;
  environment?: DeploymentEnvironment;
  explicitDeny?: boolean;
  projectId: string;
  relation?: ResourceRelation;
  requireApproval?: boolean;
  resourceId?: string;
  resourceType: string;
  roleIds: readonly BuiltinProjectRoleId[];
}

export interface AdmissionResult extends AdmissionEvidence {}

function relationCovered(
  granted: readonly ResourceRelation[],
  requested: ResourceRelation,
): boolean {
  // PROJECT_ANY is a wildcard only within this particular Capability grant.
  // It never widens the scope of another Capability on the same role.
  return granted.includes("PROJECT_ANY") || granted.includes(requested);
}

const defaultApprovalCapabilities = new Set<ProjectCapability>([
  "CAP_PROJECT_DELETE",
  "CAP_PROJECT_MEMBER_ROLE_ASSIGN",
  "CAP_PROJECT_MEMBER_REMOVE",
  "CAP_PROJECT_ROLE_CREATE",
  "CAP_PROJECT_ROLE_UPDATE",
  "CAP_PROJECT_ROLE_DELETE",
  "CAP_PROJECT_QUOTA_UPDATE",
  "CAP_AGENT_REGISTRATION_DISCOVER",
  "CAP_AGENT_REGISTRATION_UPDATE",
  "CAP_AGENT_REGISTRATION_DELETE",
  "CAP_AGENT_CONNECTION_GRANT",
  "CAP_AGENT_CONNECTION_UPDATE",
  "CAP_AGENT_INSTANCE_CREATE",
  "CAP_AGENT_INSTANCE_UPDATE",
  "CAP_AGENT_INSTANCE_START",
  "CAP_AGENT_INSTANCE_STOP",
  "CAP_AGENT_INSTANCE_RESTART",
  "CAP_AGENT_INSTANCE_DELETE",
  "CAP_AGENT_INSTANCE_OWNER_TRANSFER",
  "CAP_AGENT_INSTANCE_ACCESS_POLICY_ASSIGN",
  "CAP_AGENT_INSTANCE_RUNTIME_POLICY_ASSIGN",
  "CAP_AGENT_INSTANCE_MODEL_ROUTING_ASSIGN",
  "CAP_AGENT_ASSIGNMENT_ASSIGN",
  "CAP_AGENT_ASSIGNMENT_UNASSIGN",
  "CAP_AGENT_MEMORY_CONFIG_UPDATE",
  "CAP_AGENT_MEMORY_EMBEDDING_ASSIGN",
  "CAP_AGENT_MEMORY_CONTENT_WRITE",
  "CAP_AGENT_MEMORY_CONTENT_DELETE",
  "CAP_AGENT_MEMORY_CONTENT_PURGE",
  "CAP_AGENT_MEMORY_SESSION_INDEX_MANAGE",
  "CAP_AGENT_MEMORY_INDEX_REBUILD",
  "CAP_AGENT_MEMORY_INDEX_PURGE",
  "CAP_AGENT_MEMORY_IMPORT",
  "CAP_AGENT_MEMORY_EXPORT",
  "CAP_AGENT_MEMORY_RETENTION_UPDATE",
  "CAP_ACCESS_POLICY_CREATE",
  "CAP_ACCESS_POLICY_UPDATE",
  "CAP_ACCESS_POLICY_DELETE",
  "CAP_RUNTIME_POLICY_CREATE",
  "CAP_RUNTIME_POLICY_UPDATE",
  "CAP_RUNTIME_POLICY_DELETE",
  "CAP_PROVIDER_CREATE",
  "CAP_PROVIDER_UPDATE",
  "CAP_PROVIDER_DELETE",
  "CAP_PROVIDER_CREDENTIAL_ROTATE",
  "CAP_MODEL_CREATE",
  "CAP_MODEL_UPDATE",
  "CAP_MODEL_DELETE",
  "CAP_MODEL_ROUTING_CREATE",
  "CAP_MODEL_ROUTING_UPDATE",
  "CAP_MODEL_ROUTING_DELETE",
  "CAP_APPROVAL_POLICY_UPDATE",
  "CAP_AUDIT_RETENTION_UPDATE",
  "CAP_AUDIT_LEGAL_HOLD_MANAGE",
]);

function result(
  input: AdmissionInput,
  decision: AuthorizationDecision,
  reason: string,
  roleId?: BuiltinProjectRoleId,
  policyId?: string,
): AdmissionResult {
  return {
    actorId: input.actorId,
    capability: input.capability,
    decision,
    environment: input.environment ?? "DEV",
    projectId: input.projectId,
    reason,
    relation: input.relation ?? "PROJECT_ANY",
    resourceType: input.resourceType,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(roleId ? { roleId } : {}),
    ...(policyId ? { policyId } : {}),
  };
}

export function evaluateAdmission(input: AdmissionInput): AdmissionResult {
  if (input.explicitDeny) {
    return result(input, "DENY", "An explicit policy denied this request.");
  }
  if (!input.roleIds.length) {
    return result(input, "DENY", "The actor has no Project role binding.");
  }

  const relation = input.relation ?? "PROJECT_ANY";
  const capabilityRole = input.roleIds.find((id) =>
    builtinRole(id).grants.some((grant) => grant.capability === input.capability),
  );
  if (!capabilityRole) {
    return result(
      input,
      "DENY",
      `No bound role grants ${input.capability}.`,
    );
  }
  const relationRole = input.roleIds.find((id) => {
    const definition = builtinRole(id);
    return definition.grants.some((grant) =>
      grant.capability === input.capability
      && relationCovered(grant.relations, relation)
    );
  });
  if (!relationRole) {
    return result(
      input,
      "DENY",
      `The grant does not cover resource relation ${relation}.`,
      capabilityRole,
    );
  }

  const environment = input.environment ?? "DEV";
  const requiresApproval = input.requireApproval
    ?? (environment === "PROD" && defaultApprovalCapabilities.has(input.capability));
  if (requiresApproval) {
    const maySubmit = input.roleIds.some((id) => {
      const definition = builtinRole(id);
      return definition.grants.some((grant) =>
        grant.capability === "CAP_APPROVAL_REQUEST_SUBMIT"
        && relationCovered(grant.relations, relation)
      );
    });
    if (!maySubmit) {
      return result(
        input,
        "DENY",
        `The actor may not submit the approval required for ${input.capability}.`,
        relationRole,
      );
    }
    return result(
      input,
      "APPROVAL_REQUIRED",
      `${input.capability} requires an approved governed change in ${environment}.`,
      relationRole,
      `builtin:${environment.toLowerCase()}:governed-change`,
    );
  }
  return result(
    input,
    "ALLOW",
    `${relationRole} grants ${input.capability} for ${relation}.`,
    relationRole,
  );
}

export class CapabilityAdmissionError extends Error {
  readonly evidence: AdmissionEvidence;

  constructor(evidence: AdmissionEvidence) {
    super(
      evidence.decision === "APPROVAL_REQUIRED"
        ? `Approval required for ${evidence.capability}.`
        : `Access denied: ${evidence.capability} is not granted.`,
    );
    this.name = "CapabilityAdmissionError";
    this.evidence = evidence;
  }
}

export interface ProjectCapabilityRequirement {
  relation?: ResourceRelation;
  resourceId?: string;
  resourceType: string;
}

function projectIdFromRequest(request: Request): string {
  const match = new URL(request.url).pathname.match(
    /^\/api\/v1\/projects\/([^/]+)(?:\/|$)/,
  );
  if (!match) throw new Error("Project scope is required in the request path.");
  return decodeURIComponent(match[1]!);
}

export class ProjectAdmissionService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async authorize(
    request: Request,
    actorId: string,
    capability: ProjectCapability,
    requirement: ProjectCapabilityRequirement,
  ): Promise<AdmissionResult> {
    const projectId = projectIdFromRequest(request);
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: actorId } },
      include: {
        project: {
          select: {
            authorizationEnvironment: true,
            deletedAt: true,
          },
        },
      },
    });
    const membershipRole = membership?.role as keyof typeof membershipRoleToBuiltinRole | undefined;
    const roleIds = membership && !membership.project.deletedAt && membershipRole
      ? [membershipRoleToBuiltinRole[membershipRole]]
      : [];
    const environment = membership?.project.authorizationEnvironment as DeploymentEnvironment | undefined;
    const evidence = evaluateAdmission({
      actorId,
      capability,
      projectId,
      roleIds,
      ...requirement,
      ...(environment ? { environment } : {}),
    });
    appendAdmissionEvidence(request, evidence);
    if (evidence.decision !== "ALLOW") {
      throw new CapabilityAdmissionError(evidence);
    }
    return evidence;
  }
}
