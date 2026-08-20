import {
  projectCapabilities,
  type BuiltinProjectRoleId,
  type ProjectCapability,
  type ProjectMembershipRole,
  type ResourceRelation,
} from "@tali/contracts";

/*
 * These capabilities are not granted by Project membership. Project creation
 * belongs to the target Department Administrator; approval execution belongs
 * to the service. Project Administrator receives every other registered
 * Project capability so one administrator can complete that Project's
 * lifecycle.
 */
const capabilitiesOutsideProjectRoles = new Set<ProjectCapability>([
  "CAP_PROJECT_CREATE",
  "CAP_APPROVED_CHANGE_APPLY",
  "CAP_APPROVAL_OVERRIDE",
]);

const projectAdminCapabilities = projectCapabilities.filter(
  (capability) => !capabilitiesOutsideProjectRoles.has(capability),
);

export interface BuiltinProjectRole {
  id: BuiltinProjectRoleId;
  name: string;
  description: string;
  immutable: true;
  /**
   * Canonical grants.  Scope belongs to an individual Capability grant, not
   * to the role as a whole; otherwise adding PROJECT_ANY for a harmless
   * catalog read would also widen an Agent delete grant.
   */
  grants: readonly BuiltinProjectCapabilityGrant[];
  capabilities: readonly ProjectCapability[];
  /** Union of the relations used by grants, exposed for discovery only. */
  relations: readonly ResourceRelation[];
}

export interface BuiltinProjectCapabilityGrant {
  capability: ProjectCapability;
  relations: readonly ResourceRelation[];
}

const auditorCapabilities = [
  "CAP_PROJECT_VIEW",
  "CAP_PROJECT_MEMBER_VIEW",
  "CAP_PROJECT_ROLE_VIEW",
  "CAP_PROJECT_QUOTA_VIEW",
  "CAP_AGENT_REGISTRATION_VIEW",
  "CAP_AGENT_CONNECTION_VIEW",
  "CAP_AGENT_INSTANCE_VIEW",
  "CAP_AGENT_INSTANCE_CONFIG_VIEW",
  "CAP_AGENT_INSTANCE_LOG_VIEW",
  "CAP_AGENT_ASSIGNMENT_VIEW",
  "CAP_AGENT_MEMORY_CONFIG_VIEW",
  "CAP_AGENT_MEMORY_ITEM_VIEW",
  "CAP_AGENT_MEMORY_INDEX_STATUS_VIEW",
  "CAP_AGENT_MEMORY_RETENTION_VIEW",
  "CAP_SKILL_VIEW",
  "CAP_SKILL_ARTIFACT_METADATA_VIEW",
  "CAP_MCP_SERVER_VIEW",
  "CAP_MCP_TOOL_VIEW",
  "CAP_KNOWLEDGE_SOURCE_VIEW",
  "CAP_AGENT_SPECIALIZATION_VIEW",
  "CAP_ACCESS_POLICY_VIEW",
  "CAP_ACCESS_POLICY_VERSION_VIEW",
  "CAP_RUNTIME_POLICY_VIEW",
  "CAP_PROVIDER_VIEW",
  "CAP_MODEL_VIEW",
  "CAP_INFERENCE_GATEWAY_VIEW",
  "CAP_MODEL_ROUTING_VIEW",
  "CAP_SECRET_METADATA_VIEW",
  "CAP_APPROVAL_REQUEST_VIEW",
  "CAP_APPROVAL_POLICY_VIEW",
  "CAP_AUDIT_VIEW",
  "CAP_AUDIT_DETAIL_VIEW",
  "CAP_AUDIT_INTEGRITY_VERIFY",
  "CAP_TRACE_VIEW",
  "CAP_RUNTIME_LOG_VIEW",
  "CAP_RUNTIME_OPERATION_VIEW",
  "CAP_COST_VIEW",
  "CAP_USAGE_VIEW",
  "CAP_USAGE_DATA_QUALITY_VIEW",
] as const satisfies readonly ProjectCapability[];

const agentDeveloperCapabilities = [
  "CAP_PROJECT_VIEW",
  "CAP_PROJECT_QUOTA_VIEW",
  "CAP_AGENT_REGISTRATION_VIEW",
  "CAP_AGENT_REGISTRATION_CREATE",
  "CAP_AGENT_REGISTRATION_DISCOVER",
  "CAP_AGENT_REGISTRATION_UPDATE",
  "CAP_AGENT_REGISTRATION_DELETE",
  "CAP_AGENT_CONNECTION_VIEW",
  "CAP_AGENT_CONNECTION_GRANT",
  "CAP_AGENT_CONNECTION_UPDATE",
  "CAP_AGENT_CONNECTION_REVOKE",
  "CAP_AGENT_INSTANCE_VIEW",
  "CAP_AGENT_INSTANCE_CONFIG_VIEW",
  "CAP_AGENT_INSTANCE_CREATE",
  "CAP_AGENT_INSTANCE_UPDATE",
  "CAP_AGENT_INSTANCE_START",
  "CAP_AGENT_INSTANCE_STOP",
  "CAP_AGENT_INSTANCE_RESTART",
  "CAP_AGENT_INSTANCE_DELETE",
  "CAP_AGENT_INSTANCE_OWNER_TRANSFER",
  "CAP_AGENT_INSTANCE_LOG_VIEW",
  "CAP_AGENT_INSTANCE_INTERACT",
  "CAP_AGENT_INSTANCE_SKILL_ASSIGN",
  "CAP_AGENT_INSTANCE_MCP_SERVER_ASSIGN",
  "CAP_AGENT_INSTANCE_KNOWLEDGE_SOURCE_ASSIGN",
  "CAP_AGENT_INSTANCE_ACCESS_POLICY_ASSIGN",
  "CAP_AGENT_INSTANCE_RUNTIME_POLICY_ASSIGN",
  "CAP_AGENT_INSTANCE_MODEL_ROUTING_ASSIGN",
  "CAP_AGENT_INSTANCE_SECRET_BIND",
  "CAP_AGENT_ASSIGNMENT_VIEW",
  "CAP_AGENT_ASSIGNMENT_ASSIGN",
  "CAP_AGENT_ASSIGNMENT_UNASSIGN",
  "CAP_AGENT_SESSION_CREATE",
  "CAP_AGENT_SESSION_VIEW",
  "CAP_AGENT_SESSION_MESSAGE_SEND",
  "CAP_AGENT_SESSION_DELETE",
  "CAP_AGENT_MEMORY_CONFIG_VIEW",
  "CAP_AGENT_MEMORY_CONFIG_UPDATE",
  "CAP_AGENT_MEMORY_EMBEDDING_ASSIGN",
  "CAP_AGENT_MEMORY_ITEM_VIEW",
  "CAP_AGENT_MEMORY_SESSION_INDEX_MANAGE",
  "CAP_AGENT_MEMORY_INDEX_STATUS_VIEW",
  "CAP_AGENT_MEMORY_INDEX_VALIDATE",
  "CAP_AGENT_MEMORY_INDEX_REBUILD",
  "CAP_AGENT_MEMORY_RETENTION_VIEW",
  "CAP_SKILL_VIEW",
  "CAP_SKILL_ARTIFACT_METADATA_VIEW",
  "CAP_MCP_SERVER_VIEW",
  "CAP_MCP_TOOL_VIEW",
  "CAP_KNOWLEDGE_SOURCE_VIEW",
  "CAP_AGENT_SPECIALIZATION_VIEW",
  "CAP_ACCESS_POLICY_VIEW",
  "CAP_ACCESS_POLICY_VERSION_VIEW",
  "CAP_RUNTIME_POLICY_VIEW",
  "CAP_PROVIDER_VIEW",
  "CAP_MODEL_VIEW",
  "CAP_INFERENCE_GATEWAY_VIEW",
  "CAP_MODEL_ROUTING_VIEW",
  "CAP_SECRET_METADATA_VIEW",
  "CAP_SECRET_BIND",
  "CAP_SECRET_UNBIND",
  "CAP_APPROVAL_REQUEST_VIEW",
  "CAP_APPROVAL_REQUEST_DRAFT_CREATE",
  "CAP_APPROVAL_REQUEST_DRAFT_UPDATE",
  "CAP_APPROVAL_REQUEST_SUBMIT",
  "CAP_APPROVAL_REQUEST_COMMENT",
  "CAP_APPROVAL_REQUEST_CANCEL",
  "CAP_RUNTIME_LOG_VIEW",
  "CAP_AGENT_MEMORY_RECALL_USE",
] as const satisfies readonly ProjectCapability[];

const userCapabilities = [
  "CAP_PROJECT_VIEW",
  "CAP_AGENT_INSTANCE_VIEW",
  "CAP_AGENT_INSTANCE_INTERACT",
  "CAP_AGENT_SESSION_CREATE",
  "CAP_AGENT_SESSION_VIEW",
  "CAP_AGENT_SESSION_CONTENT_VIEW",
  "CAP_AGENT_SESSION_MESSAGE_SEND",
  "CAP_AGENT_SESSION_DELETE",
  "CAP_AGENT_MEMORY_RECALL_USE",
] as const satisfies readonly ProjectCapability[];

const approverCapabilities = [
  "CAP_PROJECT_VIEW",
  "CAP_APPROVAL_REQUEST_VIEW",
  "CAP_APPROVAL_REQUEST_COMMENT",
  "CAP_APPROVAL_REQUEST_DECIDE",
  "CAP_APPROVAL_REQUEST_ASSIGN",
  "CAP_APPROVAL_POLICY_VIEW",
  "CAP_AUDIT_VIEW",
] as const satisfies readonly ProjectCapability[];

const projectAny = ["PROJECT_ANY"] as const satisfies readonly ResourceRelation[];
const ownedAgent = ["OWNER", "MAINTAINER"] as const satisfies readonly ResourceRelation[];
const ownSession = ["SESSION_PARTICIPANT"] as const satisfies readonly ResourceRelation[];

const developerProjectReadCapabilities = new Set<ProjectCapability>([
  "CAP_PROJECT_VIEW",
  "CAP_PROJECT_QUOTA_VIEW",
  "CAP_SKILL_VIEW",
  "CAP_SKILL_ARTIFACT_METADATA_VIEW",
  "CAP_MCP_SERVER_VIEW",
  "CAP_MCP_TOOL_VIEW",
  "CAP_KNOWLEDGE_SOURCE_VIEW",
  "CAP_AGENT_SPECIALIZATION_VIEW",
  "CAP_ACCESS_POLICY_VIEW",
  "CAP_ACCESS_POLICY_VERSION_VIEW",
  "CAP_RUNTIME_POLICY_VIEW",
  "CAP_PROVIDER_VIEW",
  "CAP_MODEL_VIEW",
  "CAP_INFERENCE_GATEWAY_VIEW",
  "CAP_MODEL_ROUTING_VIEW",
  "CAP_SECRET_METADATA_VIEW",
]);

const developerSessionCapabilities = new Set<ProjectCapability>([
  "CAP_AGENT_SESSION_CREATE",
  "CAP_AGENT_SESSION_VIEW",
  "CAP_AGENT_SESSION_MESSAGE_SEND",
  "CAP_AGENT_SESSION_DELETE",
]);

const developerApprovalCapabilities = new Set<ProjectCapability>([
  "CAP_APPROVAL_REQUEST_VIEW",
  "CAP_APPROVAL_REQUEST_DRAFT_CREATE",
  "CAP_APPROVAL_REQUEST_DRAFT_UPDATE",
  "CAP_APPROVAL_REQUEST_SUBMIT",
  "CAP_APPROVAL_REQUEST_COMMENT",
  "CAP_APPROVAL_REQUEST_CANCEL",
]);

function grant(
  capability: ProjectCapability,
  relations: readonly ResourceRelation[],
): BuiltinProjectCapabilityGrant {
  return Object.freeze({ capability, relations: Object.freeze([...relations]) });
}

function sameScopeGrants(
  capabilities: readonly ProjectCapability[],
  relations: readonly ResourceRelation[],
): readonly BuiltinProjectCapabilityGrant[] {
  return capabilities.map((capability) => grant(capability, relations));
}

function developerGrant(
  capability: ProjectCapability,
): BuiltinProjectCapabilityGrant {
  if (developerProjectReadCapabilities.has(capability)) {
    return grant(capability, projectAny);
  }
  if (developerSessionCapabilities.has(capability)) {
    return grant(capability, ownSession);
  }
  if (developerApprovalCapabilities.has(capability)) {
    return grant(capability, ownedAgent);
  }
  if (capability === "CAP_AGENT_MEMORY_RECALL_USE") {
    return grant(capability, ["OWNER", "MAINTAINER", "SESSION_PARTICIPANT"]);
  }
  return grant(capability, ownedAgent);
}

function userGrant(
  capability: ProjectCapability,
): BuiltinProjectCapabilityGrant {
  if (capability === "CAP_PROJECT_VIEW") return grant(capability, projectAny);
  if (capability.startsWith("CAP_AGENT_SESSION_")) {
    return grant(capability, ownSession);
  }
  return grant(capability, ["ASSIGNED"]);
}

function role(
  input: Pick<BuiltinProjectRole, "id" | "name" | "description" | "grants">,
): BuiltinProjectRole {
  const capabilities = input.grants.map(({ capability }) => capability);
  const relations = [...new Set(input.grants.flatMap((item) => item.relations))];
  return Object.freeze({
    ...input,
    immutable: true as const,
    grants: Object.freeze([...input.grants]),
    capabilities: Object.freeze(capabilities),
    relations: Object.freeze(relations),
  });
}

export const builtinProjectRoles = Object.freeze([
  role({
    id: "ROLE_PROJECT_ADMIN",
    name: "Project Administrator",
    description: "Owns the complete Project lifecycle, including resources, models, routing, runtime operations, and evidence.",
    grants: sameScopeGrants(projectAdminCapabilities, projectAny),
  }),
  role({
    id: "ROLE_AUDITOR",
    name: "Auditor",
    description: "Observes Project behavior, risk, and compliance evidence without changing it.",
    grants: sameScopeGrants(auditorCapabilities, projectAny),
  }),
  role({
    id: "ROLE_AGENT_DEVELOPER",
    name: "Agent Developer",
    description: "Manages the lifecycle and configuration of owned or maintained Agents.",
    grants: agentDeveloperCapabilities.map(developerGrant),
  }),
  role({
    id: "ROLE_USER",
    name: "User",
    description: "Interacts with assigned Agents and participates in their own sessions.",
    grants: userCapabilities.map(userGrant),
  }),
  role({
    id: "ROLE_APPROVER",
    name: "Approver",
    description: "Reviews governed changes independently of the requester and target operator.",
    grants: sameScopeGrants(approverCapabilities, projectAny),
  }),
]);

const builtinRoleById = new Map(
  builtinProjectRoles.map((definition) => [definition.id, definition]),
);

export const membershipRoleToBuiltinRole = Object.freeze({
  admin: "ROLE_PROJECT_ADMIN",
  auditor: "ROLE_AUDITOR",
  developer: "ROLE_AGENT_DEVELOPER",
  user: "ROLE_USER",
  approver: "ROLE_APPROVER",
} as const satisfies Record<ProjectMembershipRole, BuiltinProjectRoleId>);

export function builtinRoleForMembership(
  membershipRole: ProjectMembershipRole,
): BuiltinProjectRole {
  return builtinRoleById.get(membershipRoleToBuiltinRole[membershipRole])!;
}

export function builtinRole(
  id: BuiltinProjectRoleId,
): BuiltinProjectRole {
  return builtinRoleById.get(id)!;
}

export function builtinRoleHasCapability(
  id: BuiltinProjectRoleId,
  capability: ProjectCapability,
): boolean {
  return builtinRole(id).capabilities.includes(capability);
}
