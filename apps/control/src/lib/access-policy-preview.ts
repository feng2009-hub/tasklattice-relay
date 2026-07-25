export const toolDecisions = [
  "inherit",
  "allow",
  "require_approval",
  "deny",
] as const;

export type ToolDecision = (typeof toolDecisions)[number];
export type ExplicitToolDecision = Exclude<ToolDecision, "inherit">;

export interface McpToolRulePreview {
  credentialRequirement?: string;
  decision: ToolDecision;
  description: string;
  discoveryStatus: "REVIEWED" | "NEW" | "CHANGED";
  id: string;
  toolName: string;
}

export interface McpServerPolicyPreview {
  defaultDecision: ExplicitToolDecision;
  id: string;
  name: string;
  toolRules: McpToolRulePreview[];
}

export interface AccessPolicyVersionPreview {
  actor: string;
  createdAt: string;
  revision: number;
  summary: string;
}

export interface AccessPolicyPreview {
  assignedMembers: string[];
  createdBy: string;
  description: string;
  id: string;
  name: string;
  revision: number;
  servers: McpServerPolicyPreview[];
  status: "ACTIVE" | "DRAFT";
  updatedAt: string;
  versions: AccessPolicyVersionPreview[];
}

export interface EffectiveAccessDecisionPreview {
  capability: string;
  credentialRequirement?: string;
  decision: ExplicitToolDecision;
  enforcedBy: string;
  serverId: string;
  source: string;
}

export interface OAuthConnectionPreview {
  grantedScopes: string[];
  id: string;
  ownerLabel: string;
  ownerType: "PROJECT_SERVICE" | "USER_DELEGATED";
  provider: string;
  status: "ACTIVE" | "EXPIRED";
}

export const accessPolicyPreviews: AccessPolicyPreview[] = [
  {
    id: "data-operations",
    name: "Data Operations",
    description:
      "Allow routine notebook and repository inspection while requiring approval for mutations.",
    revision: 7,
    status: "ACTIVE",
    assignedMembers: ["Jupyter Worker"],
    createdBy: "Local Administrator",
    updatedAt: "Jul 24, 2026",
    servers: [
      {
        id: "jupyter-mcp",
        name: "Jupyter MCP",
        defaultDecision: "require_approval",
        toolRules: [
          {
            id: "jupyter-status",
            toolName: "get_notebook_status",
            description: "Read the current state of an approved notebook.",
            decision: "allow",
            discoveryStatus: "REVIEWED",
          },
          {
            id: "jupyter-execute",
            toolName: "execute_notebook",
            description: "Execute cells in an approved analytics notebook.",
            decision: "require_approval",
            discoveryStatus: "REVIEWED",
            credentialRequirement: "Jupyter OAuth",
          },
          {
            id: "jupyter-delete",
            toolName: "delete_notebook",
            description: "Permanently remove a notebook and its outputs.",
            decision: "deny",
            discoveryStatus: "REVIEWED",
            credentialRequirement: "Jupyter OAuth",
          },
        ],
      },
      {
        id: "mcp-github-tools",
        name: "GitHub Tools",
        defaultDecision: "require_approval",
        toolRules: [
          {
            id: "github-search",
            toolName: "search_repositories",
            description: "Search repositories visible to the connected account.",
            decision: "allow",
            discoveryStatus: "REVIEWED",
            credentialRequirement: "GitHub OAuth",
          },
          {
            id: "github-create-issue",
            toolName: "create_issue",
            description: "Create an issue in an approved repository.",
            decision: "inherit",
            discoveryStatus: "CHANGED",
            credentialRequirement: "GitHub OAuth",
          },
          {
            id: "github-merge-pr",
            toolName: "merge_pull_request",
            description: "Merge an approved pull request.",
            decision: "deny",
            discoveryStatus: "NEW",
            credentialRequirement: "GitHub OAuth",
          },
        ],
      },
    ],
    versions: [
      {
        revision: 7,
        actor: "Local Administrator",
        createdAt: "Jul 24, 2026 · 14:32",
        summary: "Added GitHub Tools and denied merge_pull_request.",
      },
      {
        revision: 6,
        actor: "Local Administrator",
        createdAt: "Jul 19, 2026 · 09:18",
        summary: "Changed notebook execution to require approval.",
      },
      {
        revision: 5,
        actor: "Platform Admin",
        createdAt: "Jul 12, 2026 · 17:04",
        summary: "Published initial Jupyter tool decisions.",
      },
    ],
  },
  {
    id: "research-readonly",
    name: "Research Read-only",
    description:
      "Permit discovery and document reading without mutation capabilities.",
    revision: 3,
    status: "ACTIVE",
    assignedMembers: ["Research Assistant"],
    createdBy: "Platform Admin",
    updatedAt: "Jul 21, 2026",
    servers: [
      {
        id: "research-library",
        name: "Research Library",
        defaultDecision: "deny",
        toolRules: [
          {
            id: "research-search",
            toolName: "search_documents",
            description: "Search approved research collections.",
            decision: "allow",
            discoveryStatus: "REVIEWED",
          },
          {
            id: "research-read",
            toolName: "read_document",
            description: "Read one document from an approved collection.",
            decision: "allow",
            discoveryStatus: "REVIEWED",
          },
          {
            id: "research-upload",
            toolName: "upload_document",
            description: "Upload a new document into a collection.",
            decision: "deny",
            discoveryStatus: "REVIEWED",
          },
        ],
      },
    ],
    versions: [
      {
        revision: 3,
        actor: "Platform Admin",
        createdAt: "Jul 21, 2026 · 11:20",
        summary: "Explicitly denied document uploads.",
      },
      {
        revision: 2,
        actor: "Platform Admin",
        createdAt: "Jul 16, 2026 · 10:08",
        summary: "Added read_document permission.",
      },
    ],
  },
  {
    id: "incident-response",
    name: "Incident Response",
    description:
      "Allow production investigation while placing corrective actions behind approval.",
    revision: 2,
    status: "DRAFT",
    assignedMembers: [],
    createdBy: "SRE Lead",
    updatedAt: "Jul 18, 2026",
    servers: [
      {
        id: "kubernetes-mcp",
        name: "Kubernetes MCP",
        defaultDecision: "deny",
        toolRules: [
          {
            id: "kubernetes-logs",
            toolName: "get_pod_logs",
            description: "Read pod logs from approved production namespaces.",
            decision: "allow",
            discoveryStatus: "REVIEWED",
            credentialRequirement: "Production observer",
          },
          {
            id: "kubernetes-restart",
            toolName: "restart_deployment",
            description: "Restart a deployment in an approved namespace.",
            decision: "require_approval",
            discoveryStatus: "REVIEWED",
            credentialRequirement: "Production operator",
          },
        ],
      },
    ],
    versions: [
      {
        revision: 2,
        actor: "SRE Lead",
        createdAt: "Jul 18, 2026 · 18:42",
        summary: "Added approval requirement for deployment restarts.",
      },
      {
        revision: 1,
        actor: "SRE Lead",
        createdAt: "Jul 18, 2026 · 16:10",
        summary: "Created draft from discovered Kubernetes tools.",
      },
    ],
  },
];

export const oauthConnectionPreviews: OAuthConnectionPreview[] = [
  {
    id: "github-guohao",
    provider: "GitHub",
    ownerLabel: "guohao",
    ownerType: "USER_DELEGATED",
    grantedScopes: ["repo:read", "issues:write"],
    status: "ACTIVE",
  },
  {
    id: "jupyter-project",
    provider: "Jupyter",
    ownerLabel: "Analytics service account",
    ownerType: "PROJECT_SERVICE",
    grantedScopes: ["notebooks:read", "notebooks:execute"],
    status: "ACTIVE",
  },
  {
    id: "slack-operations",
    provider: "Slack",
    ownerLabel: "Operations bot",
    ownerType: "PROJECT_SERVICE",
    grantedScopes: ["channels:read", "chat:write"],
    status: "ACTIVE",
  },
];

export function toolDecisionLabel(decision: ToolDecision): string {
  if (decision === "inherit") return "Inherit server default";
  if (decision === "allow") return "Allow";
  if (decision === "require_approval") return "Require approval";
  return "Deny";
}

export function policyRuleCount(policy: AccessPolicyPreview): number {
  return policy.servers.reduce(
    (total, server) => total + server.toolRules.length,
    0,
  );
}

export function policyReviewCount(policy: AccessPolicyPreview): number {
  return policy.servers.reduce(
    (total, server) =>
      total +
      server.toolRules.filter((rule) => rule.discoveryStatus !== "REVIEWED")
        .length,
    0,
  );
}

export function withToolDecision(
  policies: AccessPolicyPreview[],
  policyId: string,
  toolId: string,
  decision: ToolDecision,
): AccessPolicyPreview[] {
  return policies.map((policy) =>
    policy.id === policyId
      ? {
          ...policy,
          servers: policy.servers.map((server) => ({
            ...server,
            toolRules: server.toolRules.map((rule) =>
              rule.id === toolId ? { ...rule, decision } : rule,
            ),
          })),
        }
      : policy,
  );
}

export function withServerDefaultDecision(
  policies: AccessPolicyPreview[],
  policyId: string,
  serverId: string,
  decision: ExplicitToolDecision,
): AccessPolicyPreview[] {
  return policies.map((policy) =>
    policy.id === policyId
      ? {
          ...policy,
          servers: policy.servers.map((server) =>
            server.id === serverId
              ? { ...server, defaultDecision: decision }
              : server,
          ),
        }
      : policy,
  );
}

export function withAssignedMember(
  policies: AccessPolicyPreview[],
  policyId: string,
  member: string,
): AccessPolicyPreview[] {
  const normalized = member.trim();
  if (!normalized) return policies;
  return policies.map((policy) =>
    policy.id === policyId
      ? {
          ...policy,
          assignedMembers: policy.assignedMembers.includes(normalized)
            ? policy.assignedMembers
            : [...policy.assignedMembers, normalized],
        }
      : policy,
  );
}

export function effectiveAccessDecisions(
  policies: AccessPolicyPreview[],
): EffectiveAccessDecisionPreview[] {
  const resolved = new Map<
    string,
    EffectiveAccessDecisionPreview & { rank: number }
  >();
  const rank = {
    allow: 1,
    require_approval: 2,
    deny: 3,
  } satisfies Record<ExplicitToolDecision, number>;

  for (const policy of policies) {
    for (const server of policy.servers) {
      for (const rule of server.toolRules) {
        const decision =
          rule.decision === "inherit"
            ? server.defaultDecision
            : rule.decision;
        const key = `${server.id}/${rule.toolName}`;
        const current = resolved.get(key);
        const next = {
          capability: `${server.name} · ${rule.toolName}`,
          ...(rule.credentialRequirement
            ? { credentialRequirement: rule.credentialRequirement }
            : {}),
          decision,
          enforcedBy: "Tool Gateway",
          rank: rank[decision],
          serverId: server.id,
          source: `${policy.name} v${policy.revision}`,
        };
        if (!current || next.rank > current.rank) resolved.set(key, next);
        else if (next.rank === current.rank) {
          resolved.set(key, {
            ...current,
            source: `${current.source}, ${policy.name} v${policy.revision}`,
          });
        }
      }
    }
  }

  return Array.from(resolved.values()).map(({ rank: _rank, ...decision }) => decision);
}
