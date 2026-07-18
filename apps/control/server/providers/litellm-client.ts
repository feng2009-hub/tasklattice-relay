import type { ModelType, ProviderKind, ProviderModelSelection } from "@tasklattice/contracts";

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
    providerKind: ProviderKind;
    model: ProviderModelSelection;
    litellmParams: Record<string, unknown>;
  }): Promise<string>;
  deleteModel(modelName: string): Promise<void>;
  probeModel(modelName: string, modelType: ModelType): Promise<void>;
  createInstanceKey(input: { agentId: string; alias: string; modelName: string }): Promise<LiteLLMVirtualKey>;
  revokeKey(tokenId: string): Promise<void>;
  listSpendLogs(from: string, to: string): Promise<LiteLLMSpendLog[]>;
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
      throw new Error(`LiteLLM returned ${response.status}${body ? `: ${body.slice(0, 320)}` : "."}`);
    return (body ? JSON.parse(body) : undefined) as T;
  }
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
