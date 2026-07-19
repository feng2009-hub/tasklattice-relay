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

export const providerKinds = [
  "openai",
  "anthropic",
  "gemini",
  "deepseek",
  "qwen",
  "moonshot",
  "zai",
  "minimax",
  "baidu-qianfan",
  "volcengine",
  "nvidia-nim",
  "azure-openai",
  "aws-bedrock",
  "vertex-ai",
  "openrouter",
  "ollama",
  "vllm",
  "huggingface",
  "custom-openai-compatible",
  "custom-anthropic-compatible",
] as const;

export const legacyProviderPresetIds = ["kimi-cn", "kimi-global"] as const;
export const providerPresetIds = [...providerKinds, ...legacyProviderPresetIds] as const;

export const modelTypes = ["llm", "text-embedding", "speech-to-text"] as const;

export interface ProviderPresetModel {
  modelId: string;
  displayName: string;
  modelType: (typeof modelTypes)[number];
  inputFeePerMillionTokens?: number;
  outputFeePerMillionTokens?: number;
  feePerAudioMinute?: number;
}

export const providerPresets = [
  {
    id: "openai",
    name: "OpenAI",
    category: "Popular",
    description: "OpenAI language, embedding, and transcription models.",
    endpoint: "https://api.openai.com/v1",
    icon: "/assets/providers/openai.webp",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    defaultModels: [
      { modelId: "gpt-5.2", displayName: "GPT-5.2", modelType: "llm" },
      { modelId: "text-embedding-3-large", displayName: "Text Embedding 3 Large", modelType: "text-embedding" },
      { modelId: "gpt-4o-transcribe", displayName: "GPT-4o Transcribe", modelType: "speech-to-text" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "Popular",
    description: "Claude models through Anthropic's native API.",
    endpoint: "https://api.anthropic.com",
    icon: "/assets/providers/anthropic.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "claude-sonnet-4-5-20250929", displayName: "Claude Sonnet 4.5", modelType: "llm" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "Popular",
    description: "Gemini models through Google AI Studio.",
    endpoint: "https://generativelanguage.googleapis.com",
    icon: "/assets/providers/gemini.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", modelType: "llm" },
      { modelId: "gemini-embedding-001", displayName: "Gemini Embedding 001", modelType: "text-embedding" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "Popular",
    description: "DeepSeek's OpenAI-compatible language model API.",
    endpoint: "https://api.deepseek.com/v1",
    icon: "/assets/providers/deepseek.webp",
    modelTypes: ["llm"],
    defaultModels: [
      {
        modelId: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        modelType: "llm",
        inputFeePerMillionTokens: 0.14,
        outputFeePerMillionTokens: 0.28,
      },
      {
        modelId: "deepseek-v4-pro",
        displayName: "DeepSeek V4 Pro",
        modelType: "llm",
        inputFeePerMillionTokens: 0.435,
        outputFeePerMillionTokens: 0.87,
      },
    ],
  },
  {
    id: "qwen",
    name: "Qwen / DashScope",
    category: "Chinese Providers",
    description: "Qwen models through DashScope's regional endpoints.",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    icon: "/assets/providers/qwen.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "qwen-plus", displayName: "Qwen Plus", modelType: "llm" },
      { modelId: "text-embedding-v4", displayName: "Text Embedding V4", modelType: "text-embedding" },
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    category: "Chinese Providers",
    description: "Kimi models through Moonshot's China or global endpoint.",
    endpoint: "https://api.moonshot.cn/v1",
    icon: "/assets/providers/kimi.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "kimi-k2.5", displayName: "Kimi K2.5", modelType: "llm" },
      { modelId: "moonshot-v1-128k", displayName: "Moonshot V1 128K", modelType: "llm" },
    ],
  },
  {
    id: "zai",
    name: "Zhipu / Z.AI",
    category: "Chinese Providers",
    description: "GLM models through the Z.AI API.",
    endpoint: "https://api.z.ai/api/paas/v4",
    icon: "/assets/providers/zai.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "glm-4.5", displayName: "GLM 4.5", modelType: "llm" },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    category: "Chinese Providers",
    description: "MiniMax language models through its native endpoint.",
    endpoint: "https://api.minimax.io/v1",
    icon: "/assets/providers/minimax.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "MiniMax-M2.1", displayName: "MiniMax M2.1", modelType: "llm" },
    ],
  },
  {
    id: "baidu-qianfan",
    name: "Baidu Qianfan",
    category: "Chinese Providers",
    description: "ERNIE and partner models through Qianfan's OpenAI-compatible API.",
    endpoint: "https://qianfan.baidubce.com/v2",
    icon: "/assets/providers/baidu.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "ernie-4.5-turbo-128k", displayName: "ERNIE 4.5 Turbo", modelType: "llm" },
    ],
  },
  {
    id: "volcengine",
    name: "ByteDance / Doubao",
    category: "Chinese Providers",
    description: "Doubao deployments hosted by Volcengine Ark.",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    icon: "/assets/providers/volcengine.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [],
  },
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    category: "Infrastructure",
    description: "NVIDIA-hosted or self-hosted NIM inference endpoints.",
    endpoint: "https://integrate.api.nvidia.com/v1",
    icon: "/assets/providers/nvidia.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "meta/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B Instruct", modelType: "llm" },
    ],
  },
  {
    id: "azure-openai",
    name: "Azure OpenAI",
    category: "Infrastructure",
    description: "Azure OpenAI deployments with explicit API versioning.",
    endpoint: null,
    icon: "/assets/providers/azure.webp",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    defaultModels: [],
  },
  {
    id: "aws-bedrock",
    name: "AWS Bedrock",
    category: "Infrastructure",
    description: "Foundation models through AWS Bedrock Runtime.",
    endpoint: null,
    icon: "/assets/providers/aws.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0", displayName: "Claude 3.5 Sonnet", modelType: "llm" },
    ],
  },
  {
    id: "vertex-ai",
    name: "Google Vertex AI",
    category: "Infrastructure",
    description: "Google Cloud-hosted foundation models through Vertex AI.",
    endpoint: null,
    icon: "/assets/providers/vertex.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", modelType: "llm" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "Infrastructure",
    description: "A unified endpoint for models from multiple providers.",
    endpoint: "https://openrouter.ai/api/v1",
    icon: "/assets/providers/openrouter.webp",
    modelTypes: ["llm"],
    defaultModels: [
      { modelId: "openai/gpt-5", displayName: "GPT-5 via OpenRouter", modelType: "llm" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "Self-Hosted / Custom",
    description: "Models served by an Ollama runtime on your network.",
    endpoint: "http://host.docker.internal:11434",
    icon: "/assets/providers/ollama.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "llama3.2", displayName: "Llama 3.2", modelType: "llm" },
    ],
  },
  {
    id: "vllm",
    name: "vLLM",
    category: "Self-Hosted / Custom",
    description: "An OpenAI-compatible vLLM inference server.",
    endpoint: null,
    icon: "/assets/providers/vllm.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    category: "Self-Hosted / Custom",
    description: "Serverless providers or a dedicated Hugging Face endpoint.",
    endpoint: null,
    icon: "/assets/providers/huggingface.webp",
    modelTypes: ["llm", "text-embedding"],
    defaultModels: [
      { modelId: "meta-llama/Llama-3.3-70B-Instruct", displayName: "Llama 3.3 70B Instruct", modelType: "llm" },
    ],
  },
  {
    id: "custom-openai-compatible",
    name: "OpenAI-compatible (Custom)",
    category: "Self-Hosted / Custom",
    description: "Any OpenAI-compatible endpoint managed by your organization.",
    endpoint: null,
    icon: "/assets/providers/custom.svg",
    modelTypes: ["llm", "text-embedding", "speech-to-text"],
    defaultModels: [],
  },
  {
    id: "custom-anthropic-compatible",
    name: "Anthropic-compatible (Custom)",
    category: "Self-Hosted / Custom",
    description: "A custom endpoint implementing the Anthropic Messages API.",
    endpoint: null,
    icon: "/assets/providers/custom-anthropic.svg",
    modelTypes: ["llm"],
    defaultModels: [],
  },
] as const satisfies ReadonlyArray<{
  id: (typeof providerKinds)[number];
  name: string;
  category: "Popular" | "Chinese Providers" | "Infrastructure" | "Self-Hosted / Custom";
  description: string;
  endpoint: string | null;
  icon: string;
  modelTypes: ReadonlyArray<(typeof modelTypes)[number]>;
  defaultModels: readonly ProviderPresetModel[];
}>;

const connectionNameSchema = z.string().trim().min(3, "Connection name must contain at least 3 characters.").max(48);
const apiKeySchema = z.string().trim().min(1, "API key is required.").max(8_192);
const endpointSchema = z.string().trim().url("Enter a valid API endpoint URL.");
const optionalText = z.string().trim().max(512).optional();

const keyedDraft = <T extends (typeof providerKinds)[number]>(
  provider: T,
  endpoint: string,
) => z.object({
  provider: z.literal(provider),
  name: connectionNameSchema,
  config: z.object({ endpoint: endpointSchema.default(endpoint) }),
  credentials: z.object({ apiKey: apiKeySchema }),
});

export const providerConnectionDraftSchema = z.discriminatedUnion("provider", [
  keyedDraft("openai", "https://api.openai.com/v1").extend({
    config: z.object({ endpoint: endpointSchema.default("https://api.openai.com/v1"), organization: optionalText }),
  }),
  keyedDraft("anthropic", "https://api.anthropic.com"),
  keyedDraft("gemini", "https://generativelanguage.googleapis.com"),
  keyedDraft("deepseek", "https://api.deepseek.com/v1"),
  z.object({ provider: z.literal("qwen"), name: connectionNameSchema, config: z.object({ region: z.enum(["cn", "international"]), endpoint: endpointSchema }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("moonshot"), name: connectionNameSchema, config: z.object({ region: z.enum(["cn", "global"]), endpoint: endpointSchema }), credentials: z.object({ apiKey: apiKeySchema }) }),
  keyedDraft("zai", "https://api.z.ai/api/paas/v4"),
  keyedDraft("minimax", "https://api.minimax.io/v1"),
  z.object({ provider: z.literal("baidu-qianfan"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema.default("https://qianfan.baidubce.com/v2"), appId: optionalText }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("volcengine"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema.default("https://ark.cn-beijing.volces.com/api/v3"), endpointId: z.string().trim().min(1, "Endpoint ID is required.").max(256) }), credentials: z.object({ apiKey: apiKeySchema }) }),
  keyedDraft("nvidia-nim", "https://integrate.api.nvidia.com/v1"),
  z.object({ provider: z.literal("azure-openai"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema, apiVersion: z.string().trim().min(1, "API version is required.").max(64), deployment: z.string().trim().min(1, "Deployment name is required.").max(256) }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("aws-bedrock"), name: connectionNameSchema, config: z.object({ region: z.string().trim().min(2, "AWS region is required.").max(64), roleArn: optionalText }), credentials: z.object({ accessKeyId: apiKeySchema, secretAccessKey: apiKeySchema, sessionToken: z.string().trim().max(8_192).optional() }) }),
  z.object({ provider: z.literal("vertex-ai"), name: connectionNameSchema, config: z.object({ project: z.string().trim().min(1, "Google Cloud project is required.").max(256), location: z.string().trim().min(1, "Google Cloud location is required.").max(128) }), credentials: z.object({ serviceAccountJson: z.string().trim().min(2, "Service-account JSON is required.").max(64_000) }) }),
  z.object({ provider: z.literal("openrouter"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema.default("https://openrouter.ai/api/v1"), siteUrl: z.string().trim().url().optional(), appName: optionalText }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("ollama"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({}) }),
  z.object({ provider: z.literal("vllm"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({ apiKey: z.string().trim().max(8_192).optional() }) }),
  z.object({ provider: z.literal("huggingface"), name: connectionNameSchema, config: z.object({ mode: z.enum(["serverless", "dedicated"]), endpoint: endpointSchema.optional(), inferenceProvider: optionalText }), credentials: z.object({ apiKey: apiKeySchema }) }),
  z.object({ provider: z.literal("custom-openai-compatible"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({ apiKey: z.string().trim().max(8_192).optional() }) }),
  z.object({ provider: z.literal("custom-anthropic-compatible"), name: connectionNameSchema, config: z.object({ endpoint: endpointSchema }), credentials: z.object({ apiKey: apiKeySchema }) }),
]);

export const providerModelSelectionSchema = z.object({
  modelId: z.string().trim().min(1).max(256),
  displayName: z.string().trim().min(1).max(160),
  modelType: z.enum(modelTypes),
  inputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  outputFeePerMillionTokens: z.number().min(0).max(1_000_000).optional(),
  feePerAudioMinute: z.number().min(0).max(1_000_000).optional(),
});

export const discoverProviderModelsSchema = providerConnectionDraftSchema;
export const createProviderConnectionSchema = z.object({
  connection: providerConnectionDraftSchema,
  models: z.array(providerModelSelectionSchema).min(1).max(100),
});

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

export const sandboxPolicyIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");

export const sandboxPolicyInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(320),
  networkAccess: z.string().trim().min(3).max(160),
  policyYaml: z.string().trim().min(10).max(64_000),
});

export const createSandboxPolicySchema = sandboxPolicyInputSchema;
export const updateSandboxPolicySchema = sandboxPolicyInputSchema;

export const providerResourceStatuses = ["VALIDATED", "DEGRADED", "FAILED"] as const;

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
  name: z.string().trim().min(3).max(64),
  description: z.string().trim().max(300).default(""),
  runtime: z.literal("openshell"),
  agentPlatform: z.enum(agentPlatformIds).default(defaultAgentPlatformId),
  modelDeploymentId: z.string().trim().min(1),
  policyId: sandboxPolicyIdSchema.optional(),
  systemPrompt: z.string().trim().min(10).max(8000),
  specializationId: z.string().trim().min(1).max(64).optional(),
  skillIds: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
  mcpServerIds: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
  knowledgeSourceIds: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
});

export type AgentStatus = (typeof agentStatuses)[number];
export type ProvisioningStage = (typeof provisioningStages)[number];
export type ProviderPresetId = (typeof providerPresetIds)[number];
export type ProviderKind = (typeof providerKinds)[number];
export type ModelType = (typeof modelTypes)[number];
export type AgentPlatformId = (typeof agentPlatformIds)[number];
export type AgentPlatform = (typeof agentPlatforms)[number];
export type SandboxPolicyId = z.infer<typeof sandboxPolicyIdSchema>;
export type SandboxPolicyInput = z.infer<typeof sandboxPolicyInputSchema>;
export type CreateSandboxPolicyInput = z.infer<typeof createSandboxPolicySchema>;
export type UpdateSandboxPolicyInput = z.infer<typeof updateSandboxPolicySchema>;
export type ProviderResourceStatus = (typeof providerResourceStatuses)[number];
export type CreateProviderAccountInput = z.infer<typeof createProviderAccountSchema>;
export type ProviderConnectionDraft = z.infer<typeof providerConnectionDraftSchema>;
export type DiscoverProviderModelsInput = z.infer<typeof discoverProviderModelsSchema>;
export type ProviderModelSelection = z.infer<typeof providerModelSelectionSchema>;
export type CreateProviderConnectionInput = z.infer<typeof createProviderConnectionSchema>;
export type CreateModelDeploymentInput = z.infer<typeof createModelDeploymentSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export interface SandboxPolicy extends SandboxPolicyInput {
  id: SandboxPolicyId;
  enforcement: "ENFORCE";
  source: "BUILT_IN" | "CUSTOM";
  immutable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SandboxPolicyCatalog {
  defaultPolicyId: SandboxPolicyId;
  templatePolicyYaml: string;
  policies: SandboxPolicy[];
}

export interface ProviderValidationCheck {
  id: "endpoint" | "catalog" | "credentials" | "inference";
  label: string;
  status: "PASS" | "FAIL" | "SKIP";
}

export interface ProviderAccount {
  id: string;
  name: string;
  providerKind: ProviderKind;
  presetId: ProviderPresetId;
  endpoint: string;
  config: Record<string, unknown>;
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

export interface ProviderDiscoveryResult {
  providerKind: ProviderKind;
  mode: "remote" | "suggested" | "manual";
  models: ProviderPresetModel[];
  checks: ProviderValidationCheck[];
  message: string;
  latencyMs?: number;
}

export interface ProviderModelFailure {
  model: ProviderModelSelection;
  message: string;
}

export interface ProviderConnectionCreationResult {
  account: ProviderAccount;
  models: ModelDeployment[];
  failures: ProviderModelFailure[];
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
  byProviderAccount: CostBreakdownItem[];
  daily: CostDailyPoint[];
}

export interface Agent extends Omit<CreateAgentInput, "policyId"> {
  id: string;
  policyId: SandboxPolicyId;
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

export interface TerminalTarget {
  id: string;
  containerName: string;
  displayName?: string;
  primary: boolean;
  available: boolean;
  reason?: string;
  shells: string[];
}

export const createTerminalSessionInputSchema = z.object({
  targetId: z.string().trim().min(1).max(128),
});

export type CreateTerminalSessionInput = z.infer<
  typeof createTerminalSessionInputSchema
>;

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
