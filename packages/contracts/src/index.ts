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

export const providerPresetIds = [
  "deepseek",
  "openai",
  "kimi-cn",
  "kimi-global",
  "custom-openai-compatible",
] as const;

export const modelTypes = ["llm", "text-embedding", "speech-to-text"] as const;

export const providerPresets = [
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek's OpenAI-compatible language model API.",
    endpoint: "https://api.deepseek.com/v1",
    icon: "/assets/providers/deepseek.svg",
    modelTypes: ["llm"],
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "OpenAI language, embedding, and transcription models.",
    endpoint: "https://api.openai.com/v1",
    icon: "/assets/providers/openai.svg",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    suggestedModels: ["gpt-5.2", "text-embedding-3-large", "gpt-4o-transcribe"],
  },
  {
    id: "kimi-cn",
    name: "Kimi China",
    description: "Moonshot AI's mainland China OpenAI-compatible endpoint.",
    endpoint: "https://api.moonshot.cn/v1",
    icon: "/assets/providers/kimi.svg",
    modelTypes: ["llm"],
    suggestedModels: ["kimi-k2.5", "moonshot-v1-128k"],
  },
  {
    id: "kimi-global",
    name: "Kimi Global",
    description: "Moonshot AI's global OpenAI-compatible endpoint.",
    endpoint: "https://api.moonshot.ai/v1",
    icon: "/assets/providers/kimi.svg",
    modelTypes: ["llm"],
    suggestedModels: ["kimi-k2.5", "moonshot-v1-128k"],
  },
  {
    id: "custom-openai-compatible",
    name: "Custom",
    description: "Any OpenAI-compatible endpoint managed by your organization.",
    endpoint: null,
    icon: "/assets/providers/custom.svg",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    suggestedModels: [],
  },
] as const satisfies ReadonlyArray<{
  id: (typeof providerPresetIds)[number];
  name: string;
  description: string;
  endpoint: string | null;
  icon: string;
  modelTypes: ReadonlyArray<(typeof modelTypes)[number]>;
  suggestedModels: readonly string[];
}>;

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

export const providerResourceStatuses = ["VALIDATED", "FAILED"] as const;

export const createProviderAccountSchema = z.object({
  name: z.string().trim().min(3).max(48),
  presetId: z.enum(providerPresetIds),
  endpoint: z.string().trim().url(),
  apiKey: z.string().trim().min(8).max(512),
}).superRefine((input, context) => {
  const preset = providerPresets.find((item) => item.id === input.presetId);
  if (preset?.endpoint && input.endpoint.replace(/\/+$/, "") !== preset.endpoint)
    context.addIssue({
      code: "custom",
      path: ["endpoint"],
      message: `The ${preset.name} endpoint is managed by the platform catalog.`,
    });
});

export const createModelDeploymentSchema = z.object({
  providerAccountId: z.string().trim().min(1),
  modelId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  modelType: z.enum(modelTypes),
  inputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  outputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  feePerAudioMinute: z.number().min(0).max(1_000_000).optional(),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(3).max(48),
  description: z.string().trim().max(240).default(""),
  runtime: z.literal("nemoclaw"),
  agentPlatform: z.enum(agentPlatformIds).default(defaultAgentPlatformId),
  modelDeploymentId: z.string().trim().min(1),
  policyId: z.enum(sandboxPolicyIds).default("restricted"),
  systemPrompt: z.string().trim().min(10).max(8000),
});

export type AgentStatus = (typeof agentStatuses)[number];
export type ProvisioningStage = (typeof provisioningStages)[number];
export type ProviderPresetId = (typeof providerPresetIds)[number];
export type ModelType = (typeof modelTypes)[number];
export type AgentPlatformId = (typeof agentPlatformIds)[number];
export type AgentPlatform = (typeof agentPlatforms)[number];
export type SandboxPolicyId = (typeof sandboxPolicyIds)[number];
export type SandboxPolicy = (typeof sandboxPolicies)[number];
export type ProviderResourceStatus = (typeof providerResourceStatuses)[number];
export type CreateProviderAccountInput = z.infer<typeof createProviderAccountSchema>;
export type CreateModelDeploymentInput = z.infer<typeof createModelDeploymentSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export interface ProviderValidationCheck {
  id: "endpoint" | "catalog" | "credentials" | "inference";
  label: string;
  status: "PASS" | "FAIL";
}

export interface ProviderAccount extends Omit<CreateProviderAccountInput, "apiKey"> {
  id: string;
  discoveredModels: string[];
  status: ProviderResourceStatus;
  checks: ProviderValidationCheck[];
  credentialState: "STORED";
  validationMessage: string;
  validationLatencyMs?: number;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelDeployment extends CreateModelDeploymentInput {
  id: string;
  providerPresetId: ProviderPresetId;
  providerName: string;
  endpoint: string;
  litellmModelName: string;
  status: ProviderResourceStatus;
  checks: ProviderValidationCheck[];
  validationMessage: string;
  validationLatencyMs?: number;
  validatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CostBreakdownItem {
  id: string;
  label: string;
  detail: string;
  spend: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CostDailyPoint {
  date: string;
  spend: number;
}

export interface CostReport {
  currency: "USD";
  from: string;
  to: string;
  totalSpend: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  byInstance: CostBreakdownItem[];
  byModel: CostBreakdownItem[];
  daily: CostDailyPoint[];
}

export interface Agent extends CreateAgentInput {
  id: string;
  providerAccountId: string;
  providerName: string;
  model: string;
  modelType: "llm";
  costKeyAlias: string;
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
