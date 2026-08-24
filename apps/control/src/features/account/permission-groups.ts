import {
  projectCapabilities,
  type AuthorizationCapability,
  type ProjectCapability,
} from "@tali/contracts";

const projectRoleCapabilities = projectCapabilities.filter(
  (capability) => capability !== "CAP_PROJECT_CREATE",
);

export type PermissionItem = {
  capability: AuthorizationCapability;
  enabled: boolean;
};

export type PermissionGroup = {
  id: string;
  title: string;
  description: string;
  items: PermissionItem[];
};

const definitions = [
  {
    id: "project",
    title: "Project & membership",
    description: "Project identity, settings, quota, membership, and roles.",
    prefixes: ["CAP_PROJECT_"],
  },
  {
    id: "agents",
    title: "Agents & runtime",
    description:
      "Agent registration, Instances, connections, assignments, and sessions.",
    prefixes: [
      "CAP_AGENT_REGISTRATION_",
      "CAP_AGENT_CONNECTION_",
      "CAP_AGENT_INSTANCE_",
      "CAP_AGENT_ASSIGNMENT_",
      "CAP_AGENT_SESSION_",
      "CAP_RUNTIME_LOG_",
      "CAP_RUNTIME_OPERATION_",
    ],
  },
  {
    id: "memory",
    title: "Memory",
    description:
      "Memory configuration, recall, retention, and index operations.",
    prefixes: ["CAP_AGENT_MEMORY_"],
  },
  {
    id: "models",
    title: "Models & providers",
    description:
      "Provider discovery, model validation, routing, and inference access.",
    prefixes: ["CAP_PROVIDER_", "CAP_MODEL_", "CAP_INFERENCE_GATEWAY_"],
  },
  {
    id: "resources",
    title: "Tools & knowledge",
    description:
      "Skills, MCP servers, knowledge sources, and Agent specializations.",
    prefixes: [
      "CAP_SKILL_",
      "CAP_MCP_",
      "CAP_KNOWLEDGE_SOURCE_",
      "CAP_AGENT_SPECIALIZATION_",
    ],
  },
  {
    id: "governance",
    title: "Governance & evidence",
    description:
      "Policies, approvals, audit evidence, traces, usage, cost, and Secrets.",
    prefixes: [
      "CAP_ACCESS_POLICY_",
      "CAP_RUNTIME_POLICY_",
      "CAP_APPROVAL_",
      "CAP_APPROVED_",
      "CAP_AUDIT_",
      "CAP_TRACE_",
      "CAP_USAGE_",
      "CAP_COST_",
      "CAP_SECRET_",
    ],
  },
] as const;

export function groupProjectCapabilities(
  effectiveCapabilities: readonly ProjectCapability[],
): PermissionGroup[] {
  const effective = new Set(effectiveCapabilities);
  const remaining = new Set(projectRoleCapabilities);
  const groups: PermissionGroup[] = definitions.map((definition) => {
    const capabilities = projectRoleCapabilities.filter((capability) =>
      definition.prefixes.some((prefix) => capability.startsWith(prefix)),
    );
    capabilities.forEach((capability) => remaining.delete(capability));
    const items = capabilities.map((capability) => ({
      capability,
      enabled: effective.has(capability),
    }));
    return { ...definition, items };
  });

  if (remaining.size) {
    groups.push({
      id: "other",
      title: "Other",
      description:
        "Permissions that are not assigned to a standard permission domain.",
      items: Array.from(remaining, (capability) => ({
        capability,
        enabled: effective.has(capability),
      })),
    });
  }

  return groups.filter((group) => group.items.length > 0);
}
