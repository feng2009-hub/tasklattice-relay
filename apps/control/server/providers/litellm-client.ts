import type { CreateModelDeploymentInput, ProviderPresetId } from "@tasklattice/contracts";

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

export interface LiteLLMAdminClient {
  readonly baseUrl: string;
  registerModel(input: {
    accountId: string;
    apiKey: string;
    deployment: CreateModelDeploymentInput;
    endpoint: string;
    presetId: ProviderPresetId;
  }): Promise<string>;
  createInstanceKey(input: { agentId: string; alias: string; modelName: string }): Promise<LiteLLMVirtualKey>;
  revokeKey(tokenId: string): Promise<void>;
  listSpendLogs(from: string, to: string): Promise<LiteLLMSpendLog[]>;
}

const providerPrefix: Record<ProviderPresetId, string> = {
  deepseek: "deepseek",
  openai: "openai",
  "kimi-cn": "openai",
  "kimi-global": "openai",
  "custom-openai-compatible": "openai",
};

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
    apiKey: string;
    deployment: CreateModelDeploymentInput;
    endpoint: string;
    presetId: ProviderPresetId;
  }): Promise<string> {
    this.assertConfigured();
    const modelName = `tali/${input.accountId.slice(0, 8)}/${input.deployment.modelId}`;
    await this.request("/model/new", {
      method: "POST",
      body: JSON.stringify({
        model_name: modelName,
        litellm_params: {
          model: `${providerPrefix[input.presetId]}/${input.deployment.modelId}`,
          api_base: input.endpoint,
          api_key: input.apiKey,
          ...(input.deployment.inputFeePerMillionTokens !== undefined
            ? { input_cost_per_token: input.deployment.inputFeePerMillionTokens / 1_000_000 }
            : {}),
          ...(input.deployment.outputFeePerMillionTokens !== undefined
            ? { output_cost_per_token: input.deployment.outputFeePerMillionTokens / 1_000_000 }
            : {}),
        },
      }),
    });
    return modelName;
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.masterKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok)
      throw new Error(`LiteLLM returned ${response.status}${body ? `: ${body.slice(0, 320)}` : "."}`);
    return (body ? JSON.parse(body) : undefined) as T;
  }
}
