import type { ProjectCapability } from "@tali/contracts";

export type PermissionGroup = {
  id: string;
  title: string;
  description: string;
  items: ProjectCapability[];
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
  capabilities: readonly ProjectCapability[],
): PermissionGroup[] {
  const remaining = new Set(capabilities);
  const groups: PermissionGroup[] = definitions.map((definition) => {
    const items = capabilities.filter((capability) =>
      definition.prefixes.some((prefix) => capability.startsWith(prefix)),
    );
    items.forEach((capability) => remaining.delete(capability));
    return { ...definition, items };
  });

  if (remaining.size) {
    groups.push({
      id: "other",
      title: "Other",
      description:
        "Capabilities that are not assigned to a standard permission domain.",
      items: Array.from(remaining),
    });
  }

  return groups.filter((group) => group.items.length > 0);
}
