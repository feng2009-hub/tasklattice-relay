import { z } from "zod";

export const agentStatuses = [
  "PROVISIONING",
  "READY",
  "FAILED",
  "DESTROYING",
] as const;

export const provisioningStages = [
  "QUEUED",
  "PROVIDER",
  "SANDBOX",
  "POD",
  "RUNTIME",
  "ENDPOINT",
  "READY",
] as const;

export const agentModels = ["deepseek-chat", "deepseek-reasoner"] as const;

export const agentPlatformIds = ["openclaw", "hermes"] as const;

export const agentPlatforms = [
  {
    id: "openclaw",
    name: "OpenClaw",
    description: "Gateway-based Agent with a plugin ecosystem and browser UI.",
    terminalLabel: "OpenClaw TUI",
    endpointLabel: "OpenClaw Web UI",
    isDefault: true,
  },
  {
    id: "hermes",
    name: "Hermes",
    description: "Self-improving Agent with durable memory and a learning loop.",
    terminalLabel: "Hermes TUI",
    endpointLabel: "Hermes dashboard",
    isDefault: false,
  },
] as const satisfies ReadonlyArray<{
  description: string;
  endpointLabel: string;
  id: (typeof agentPlatformIds)[number];
  isDefault: boolean;
  name: string;
  terminalLabel: string;
}>;

export const defaultAgentPlatformId = agentPlatforms.find(
  (platform) => platform.isDefault,
)!.id;

export const sandboxPolicies = [
  {
    id: "restricted",
    name: "Restricted",
    description:
      "Default-deny egress with OpenShell's baseline filesystem and process isolation.",
    enforcement: "ENFORCE",
    networkAccess: "Managed inference only",
    policyYaml: `version: 1
network_policies: {}
`,
  },
  {
    id: "github-readonly",
    name: "GitHub Read-only",
    description:
      "Allows gh and curl to read the GitHub API while write methods remain denied.",
    enforcement: "ENFORCE",
    networkAccess: "api.github.com · GET, HEAD, OPTIONS",
    policyYaml: `version: 1
network_policies:
  github_api:
    name: github-api
    endpoints:
      - host: api.github.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: read-only
    binaries:
      - path: /usr/bin/gh
      - path: /usr/bin/curl
`,
  },
  {
    id: "github-full-access",
    name: "GitHub Full Access",
    description:
      "Example policy that allows any HTTP method and path on the declared GitHub API endpoint.",
    enforcement: "ENFORCE",
    networkAccess: "api.github.com · all methods and paths",
    policyYaml: `version: 1
network_policies:
  github_api_full_access:
    name: github-api-full-access
    endpoints:
      - host: api.github.com
        port: 443
        protocol: rest
        enforcement: enforce
        access: full
    binaries:
      - path: /usr/bin/gh
      - path: /usr/bin/curl
`,
  },
  {
    id: "package-install",
    name: "Package Install",
    description:
      "Allows package managers to reach the npm and Python package registries.",
    enforcement: "ENFORCE",
    networkAccess: "npmjs.org · pypi.org · pythonhosted.org",
    policyYaml: `version: 1
network_policies:
  package_registries:
    name: package-registries
    endpoints:
      - host: registry.npmjs.org
        port: 443
      - host: pypi.org
        port: 443
      - host: files.pythonhosted.org
        port: 443
    binaries:
      - path: /usr/bin/npm
      - path: /usr/bin/pip
      - path: /usr/local/bin/pip
      - path: /usr/local/bin/uv
`,
  },
] as const;

export const sandboxPolicyIds = sandboxPolicies.map((policy) => policy.id) as [
  "restricted",
  "github-readonly",
  "github-full-access",
  "package-install",
];

export const providerConnectionStatuses = ["VALIDATED", "FAILED"] as const;

export const createProviderConnectionSchema = z.object({
  name: z.string().trim().min(3).max(48),
  provider: z.literal("deepseek"),
  endpoint: z.string().trim().url(),
  model: z.enum(agentModels),
  inputFeePerMillionTokens: z.number().min(0).max(1_000_000).default(0),
  outputFeePerMillionTokens: z.number().min(0).max(1_000_000).default(0),
  apiKey: z.string().trim().min(8).max(512),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(3).max(48),
  description: z.string().trim().max(240).default(""),
  runtime: z.literal("nemoclaw"),
  agentPlatform: z.enum(agentPlatformIds).default(defaultAgentPlatformId),
  providerConnectionId: z.string().trim().min(1),
  provider: z.literal("deepseek"),
  model: z.enum(agentModels),
  policyId: z.enum(sandboxPolicyIds).default("restricted"),
  systemPrompt: z.string().trim().min(10).max(8000),
});

export type AgentStatus = (typeof agentStatuses)[number];
export type ProvisioningStage = (typeof provisioningStages)[number];
export type AgentModel = (typeof agentModels)[number];
export type AgentPlatformId = (typeof agentPlatformIds)[number];
export type AgentPlatform = (typeof agentPlatforms)[number];
export type SandboxPolicyId = (typeof sandboxPolicyIds)[number];
export type SandboxPolicy = (typeof sandboxPolicies)[number];
export type ProviderConnectionStatus =
  (typeof providerConnectionStatuses)[number];
export type CreateProviderConnectionInput = z.infer<
  typeof createProviderConnectionSchema
>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export interface ProviderConnectionValidationCheck {
  id: "endpoint" | "model" | "credentials" | "inference";
  label: string;
  status: "PASS" | "FAIL";
}

export interface ProviderConnection
  extends Omit<CreateProviderConnectionInput, "apiKey"> {
  id: string;
  status: ProviderConnectionStatus;
  checks: ProviderConnectionValidationCheck[];
  credentialState: "STORED";
  validationMessage: string;
  validationLatencyMs?: number;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent extends CreateAgentInput {
  id: string;
  sandboxName: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  operationId?: string;
  runtimePhase?: string;
  provisioningStage?: ProvisioningStage;
  logs: string[];
  httpEndpoint?: HttpEndpoint;
  error?: string;
}

export interface HttpEndpoint {
  kind: "openclaw-webui" | "hermes-dashboard";
  status: "READY" | "UNAVAILABLE";
  url?: string;
  reason?: string;
}

export interface RunnerSandbox {
  name: string;
  agentPlatform: AgentPlatformId;
  phase:
    | "PROVISIONING"
    | "READY"
    | "FAILED"
    | "NOT_FOUND"
    | "DESTROYING";
  operationId?: string;
  provisioningStage?: ProvisioningStage;
  logs: string[];
  httpEndpoint?: HttpEndpoint;
  error?: string;
}

export interface SandboxAuditEvent {
  id: string;
  timestamp: string;
  source: "gateway" | "sandbox" | "unknown";
  category: string;
  severity: "INFO" | "LOW" | "MED" | "HIGH" | "CRIT" | "UNKNOWN";
  decision:
    | "ALLOWED"
    | "DENIED"
    | "BLOCKED"
    | "APPROVED"
    | "REJECTED"
    | "OBSERVED";
  summary: string;
  policy?: string;
  raw: string;
}

export interface RunnerHealth {
  ok: boolean;
  mode: string;
}

export interface RuntimeStatus {
  mode: string;
  terminal: {
    available: boolean;
    kind: "nemoclaw-tui";
    transport: "nemoclaw" | "openshell" | "none";
    reason?: string;
  };
}

export function supportsNemoClawTui(mode: string): boolean {
  return mode === "nemoclaw" || mode === "openshell-kubernetes";
}

export interface TerminalSessionResponse {
  id: string;
  expiresAt: string;
  websocketUrl: string;
}

const terminalResizePrefix = "\u0000TALI_RESIZE:";

export interface TerminalResize {
  cols: number;
  rows: number;
}

export function encodeTerminalResize({ cols, rows }: TerminalResize): string {
  return `${terminalResizePrefix}${cols}:${rows}`;
}

export function parseTerminalResize(input: string): TerminalResize | undefined {
  if (!input.startsWith(terminalResizePrefix)) return undefined;
  const parts = input.slice(terminalResizePrefix.length).split(":");
  if (parts.length !== 2) return undefined;
  const [colsText, rowsText] = parts;
  if (colsText === undefined || rowsText === undefined) return undefined;
  const cols = Number(colsText);
  const rows = Number(rowsText);
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 20 ||
    cols > 500 ||
    rows < 5 ||
    rows > 300
  )
    return undefined;
  return { cols, rows };
}
