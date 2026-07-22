import { createHash } from "node:crypto";
import type {
  ComplianceDomain,
  InferenceGroupCapabilities,
  ModelType,
  ProviderKind,
  ProviderModelSelection,
} from "@tasklattice/contracts";

interface LiteLLMVirtualKeyResponse {
  key: string;
  token?: string;
}

export interface LiteLLMVirtualKey {
  secret: string;
  tokenId: string;
}

export interface LiteLLMSpendLog {
  api_key?: string;
  end_user?: string;
  user?: string;
  model?: string;
  model_group?: string;
  spend?: number;
  startTime?: string;
  start_time?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  request_id?: string;
}

export interface LiteLLMInferenceInspection {
  exists: boolean;
  version?: string;
  modelCount: number;
  complianceDomains: ComplianceDomain[];
  complianceUnknown: boolean;
  capabilities: InferenceGroupCapabilities;
  configurationHash: string;
  unsupportedReason?: string;
}

export interface LiteLLMAdminClient {
  readonly baseUrl: string;
  registerModel(input: {
    accountId: string;
    providerKind: ProviderKind;
    model: ProviderModelSelection;
    litellmParams: Record<string, unknown>;
    complianceDomain: ComplianceDomain;
    endpointRegion: string;
  }): Promise<string>;
  deleteModel(modelName: string): Promise<void>;
  probeModel(modelName: string, modelType: ModelType): Promise<void>;
  createInstanceKey(input: { agentId: string; alias: string; modelName: string }): Promise<LiteLLMVirtualKey>;
  revokeKey(tokenId: string): Promise<void>;
  listSpendLogs(from: string, to: string): Promise<LiteLLMSpendLog[]>;
  inspectInferenceGroup?(modelAlias: string): Promise<LiteLLMInferenceInspection>;
  createInferenceGroupTeam?(input: { alias: string; modelAlias: string; inferenceGroupId: string; complianceDomain: ComplianceDomain }): Promise<string>;
  deleteInferenceGroupTeam?(teamId: string): Promise<void>;
  createInferenceGroupKey?(input: { agentId: string; alias: string; modelAlias: string; teamId: string; inferenceGroupId: string; complianceDomain: ComplianceDomain }): Promise<LiteLLMVirtualKey>;
}

export class LiteLLMClient implements LiteLLMAdminClient {
  readonly baseUrl: string;

  constructor(
    baseUrl = process.env.LITELLM_BASE_URL ?? "http://127.0.0.1:4000",
    private readonly masterKey = process.env.LITELLM_MASTER_KEY ?? "",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async registerModel(input: {
    accountId: string;
    providerKind: ProviderKind;
    model: ProviderModelSelection;
    litellmParams: Record<string, unknown>;
    complianceDomain: ComplianceDomain;
    endpointRegion: string;
  }): Promise<string> {
    this.assertConfigured();
    const modelName = `tali/${input.accountId.slice(0, 8)}/${input.model.modelId}`;
    await this.request("/model/new", {
      method: "POST",
      body: JSON.stringify({
        model_name: modelName,
        litellm_params: {
          ...input.litellmParams,
          ...(input.model.inputFeePerMillionTokens !== undefined
            ? { input_cost_per_token: input.model.inputFeePerMillionTokens / 1_000_000 }
            : {}),
          ...(input.model.outputFeePerMillionTokens !== undefined
            ? { output_cost_per_token: input.model.outputFeePerMillionTokens / 1_000_000 }
            : {}),
        },
        model_info: {
          tasklatticeProviderAccountId: input.accountId,
          providerKind: input.providerKind,
          compliance_domain: input.complianceDomain,
          endpoint_region: input.endpointRegion,
          cross_border_transfer: false,
        },
      }),
    });
    return modelName;
  }

  async deleteModel(modelName: string): Promise<void> {
    this.assertConfigured();
    const response = await this.request<{
      data?: Array<{ model_name?: string; model_info?: { id?: string } }>;
    }>("/model/info");
    const modelId = response.data?.find(
      (model) => model.model_name === modelName,
    )?.model_info?.id;
    if (!modelId) return;
    await this.request("/model/delete", {
      method: "POST",
      body: JSON.stringify({ id: modelId }),
    });
  }

  async probeModel(modelName: string, modelType: ModelType): Promise<void> {
    this.assertConfigured();
    if (modelType === "llm") {
      await this.request("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 1,
        }),
      });
      return;
    }
    if (modelType === "text-embedding") {
      await this.request("/embeddings", {
        method: "POST",
        body: JSON.stringify({ model: modelName, input: "TaskLattice validation" }),
      });
      return;
    }
    const form = new FormData();
    form.set("model", modelName);
    form.set("file", new Blob([silentWav()], { type: "audio/wav" }), "validation.wav");
    await this.request("/audio/transcriptions", { method: "POST", body: form });
  }

  async createInstanceKey(input: {
    agentId: string;
    alias: string;
    modelName: string;
  }): Promise<LiteLLMVirtualKey> {
    this.assertConfigured();
    const response = await this.request<LiteLLMVirtualKeyResponse>("/key/generate", {
      method: "POST",
      body: JSON.stringify({
        key_alias: input.alias,
        user_id: input.agentId,
        models: [input.modelName],
      }),
    });
    if (!response.key) throw new Error("LiteLLM did not return a virtual key.");
    return { secret: response.key, tokenId: response.token ?? response.key };
  }

  async createInferenceGroupTeam(input: { alias: string; modelAlias: string; inferenceGroupId: string; complianceDomain: ComplianceDomain }): Promise<string> {
    this.assertConfigured();
    const response = await this.request<{ team_id?: string; id?: string }>("/team/new", {
      method: "POST",
      body: JSON.stringify({
        team_alias: input.alias,
        models: [input.modelAlias],
        metadata: {
          managed_by: "tasklattice",
          inference_group_id: input.inferenceGroupId,
          inference_group_alias: input.modelAlias,
          compliance_domain: input.complianceDomain,
        },
      }),
    });
    const id = response.team_id ?? response.id;
    if (!id) throw new Error("LiteLLM did not return a Team identifier.");
    return id;
  }

  async deleteInferenceGroupTeam(teamId: string): Promise<void> {
    this.assertConfigured();
    await this.request("/team/delete", {
      method: "POST",
      body: JSON.stringify({ team_ids: [teamId] }),
    });
  }

  async createInferenceGroupKey(input: { agentId: string; alias: string; modelAlias: string; teamId: string; inferenceGroupId: string; complianceDomain: ComplianceDomain }): Promise<LiteLLMVirtualKey> {
    this.assertConfigured();
    const response = await this.request<LiteLLMVirtualKeyResponse>("/key/generate", {
      method: "POST",
      body: JSON.stringify({
        key_alias: input.alias,
        user_id: input.agentId,
        team_id: input.teamId,
        models: [input.modelAlias],
        metadata: {
          managed_by: "tasklattice",
          inference_group_id: input.inferenceGroupId,
          agent_id: input.agentId,
          compliance_domain: input.complianceDomain,
        },
      }),
    });
    if (!response.key) throw new Error("LiteLLM did not return a virtual key.");
    return { secret: response.key, tokenId: response.token ?? response.key };
  }

  async inspectInferenceGroup(modelAlias: string): Promise<LiteLLMInferenceInspection> {
    this.assertConfigured();
    const [models, health] = await Promise.all([
      this.request<{ data?: Array<{
        model_name?: string;
        litellm_params?: Record<string, unknown>;
        model_info?: Record<string, unknown>;
      }> }>("/model/info"),
      this.request<Record<string, unknown>>("/health/liveliness").catch((): Record<string, unknown> => ({})),
    ]);
    const allModels = models.data ?? [];
    const matching = allModels.filter((item) => item.model_name === modelAlias);
    const versionValue = health.version ?? health.litellm_version;
    const version = typeof versionValue === "string" ? versionValue : undefined;
    const targetModelNames = new Set<string>();
    let automaticRouting = false;
    let routerType: InferenceGroupCapabilities["routerType"] = "UNKNOWN";
    let complexityTierCount: number | undefined;
    let sessionAffinity: InferenceGroupCapabilities["sessionAffinity"] = "UNKNOWN";
    let adaptiveRouting: InferenceGroupCapabilities["adaptiveRouting"] = "UNKNOWN";
    let generalFallback: InferenceGroupCapabilities["generalFallback"] = "UNKNOWN";
    let contextWindowFallback: InferenceGroupCapabilities["contextWindowFallback"] = "UNKNOWN";
    let contentPolicyFallback: InferenceGroupCapabilities["contentPolicyFallback"] = "UNKNOWN";
    let retries: InferenceGroupCapabilities["retries"] = "UNKNOWN";
    let requestAudit: InferenceGroupCapabilities["requestAudit"] = "UNKNOWN";
    for (const item of matching) {
      const info = item.model_info ?? {};
      const params = item.litellm_params ?? {};
      const backingModel = params.model;
      const isAutoRouter = typeof backingModel === "string" && backingModel.startsWith("auto_router/");
      automaticRouting ||= isAutoRouter;
      if (isAutoRouter)
        routerType = backingModel === "auto_router/complexity_router" ? "COMPLEXITY_ROUTER" : "OTHER";
      const complexityConfig = record(params.complexity_router_config);
      const tiers = record(complexityConfig?.tiers);
      if (tiers) {
        complexityTierCount = Object.keys(tiers).length;
        collectStrings(Object.values(tiers), targetModelNames);
      }
      if (typeof params.complexity_router_default_model === "string")
        targetModelNames.add(params.complexity_router_default_model);
      if (isAutoRouter) {
        sessionAffinity = complexityConfig?.session_affinity === false ? "DISABLED" : "ENABLED";
        adaptiveRouting = complexityConfig?.adaptive === true ? "ENABLED" : "DISABLED";
      }
      const fallbacks = info.fallbacks ?? params.fallbacks ?? info.fallback_group;
      const contextFallbacks = info.context_window_fallbacks ?? params.context_window_fallbacks;
      const policyFallbacks = info.content_policy_fallbacks ?? params.content_policy_fallbacks;
      if (fallbacks !== undefined) {
        generalFallback = hasValues(fallbacks) ? "ENABLED" : "DISABLED";
        collectStrings(fallbacks, targetModelNames);
      }
      if (contextFallbacks !== undefined) {
        contextWindowFallback = hasValues(contextFallbacks) ? "ENABLED" : "DISABLED";
        collectStrings(contextFallbacks, targetModelNames);
      }
      if (policyFallbacks !== undefined) {
        contentPolicyFallback = hasValues(policyFallbacks) ? "ENABLED" : "DISABLED";
        collectStrings(policyFallbacks, targetModelNames);
      }
      const retryValue = params.num_retries ?? info.num_retries;
      if (typeof retryValue === "number") retries = retryValue > 0 ? "ENABLED" : "DISABLED";
      if (info.request_audit ?? info.logging_callback ?? params.success_callback) requestAudit = "ENABLED";
    }
    const effectiveModels = targetModelNames.size
      ? allModels.filter((item) => item.model_name && targetModelNames.has(item.model_name))
      : matching;
    const domains = new Set<ComplianceDomain>();
    const resolvedTargetNames = new Set(effectiveModels.map((item) => item.model_name).filter((name): name is string => Boolean(name)));
    let complianceUnknown = effectiveModels.length === 0
      || (targetModelNames.size > 0 && resolvedTargetNames.size !== targetModelNames.size);
    for (const item of effectiveModels) {
      const info = item.model_info ?? {};
      const domain = info.compliance_domain ?? info.complianceDomain;
      if (domain === "CN_MAINLAND" || domain === "GLOBAL") domains.add(domain);
      else complianceUnknown = true;
    }
    const autoRouterUnsupported = automaticRouting && (!version || !versionAtLeast(version, 1, 94));
    const failover = generalFallback === "ENABLED" || effectiveModels.length > 1 ? "ENABLED" : "UNKNOWN";
    return {
      exists: matching.length > 0,
      ...(version ? { version } : {}),
      modelCount: effectiveModels.length || matching.length,
      complianceDomains: [...domains],
      complianceUnknown,
      capabilities: {
        automaticRouting: matching.length ? (automaticRouting ? "ENABLED" : "DISABLED") : "UNKNOWN",
        routerType,
        ...(complexityTierCount !== undefined ? { complexityTierCount } : {}),
        sessionAffinity,
        adaptiveRouting,
        failover,
        generalFallback,
        contextWindowFallback,
        contentPolicyFallback,
        retries,
        requestAudit,
      },
      configurationHash: stableConfigurationHash({ matching, effectiveModels }),
      ...(autoRouterUnsupported ? { unsupportedReason: `LiteLLM ${version ?? "version unknown"} cannot safely support Auto Router v2; version 1.94 or newer is required.` } : {}),
    };
  }

  async revokeKey(tokenId: string): Promise<void> {
    this.assertConfigured();
    await this.request("/key/delete", {
      method: "POST",
      body: JSON.stringify({ keys: [tokenId] }),
    });
  }

  async listSpendLogs(from: string, to: string): Promise<LiteLLMSpendLog[]> {
    this.assertConfigured();
    const query = new URLSearchParams({
      start_date: from,
      end_date: to,
      summarize: "false",
    });
    const response = await this.request<LiteLLMSpendLog[] | { data?: LiteLLMSpendLog[] }>(
      `/spend/logs?${query}`,
    );
    return Array.isArray(response) ? response : response.data ?? [];
  }

  private assertConfigured(): void {
    if (!this.masterKey)
      throw new Error("LiteLLM is not configured. Set LITELLM_MASTER_KEY before registering models or creating Instances.");
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const formData = typeof FormData !== "undefined" && init.body instanceof FormData;
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.masterKey}`,
        ...(!formData ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok)
      throw new Error(`LiteLLM returned ${response.status}${body ? `: ${redactSecrets(body.slice(0, 320), this.masterKey)}` : "."}`);
    return (body ? JSON.parse(body) : undefined) as T;
  }
}

function redactSecrets(value: string, masterKey: string): string {
  return value
    .replaceAll(masterKey, masterKey ? "[REDACTED]" : "")
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, "[REDACTED]");
}

function versionAtLeast(version: string, major: number, minor: number): boolean {
  const match = version.match(/(\d+)\.(\d+)/);
  if (!match) return false;
  const currentMajor = Number(match[1]);
  const currentMinor = Number(match[2]);
  return currentMajor > major || (currentMajor === major && currentMinor >= minor);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function collectStrings(value: unknown, target: Set<string>): void {
  if (typeof value === "string") {
    target.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, target));
    return;
  }
  if (value && typeof value === "object")
    Object.values(value).forEach((item) => collectStrings(item, target));
}

function hasValues(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function stableConfigurationHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(sanitizeForHash(value))).digest("hex")}`;
}

function sanitizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForHash);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["api_key", "authorization", "password", "secret", "secret_access_key", "access_key_id"].includes(key.toLowerCase()))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sanitizeForHash(nested)]),
  );
}

function silentWav(): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + 1_600);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  write(0, "RIFF");
  view.setUint32(4, 36 + 1_600, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, 1_600, true);
  return buffer;
}
