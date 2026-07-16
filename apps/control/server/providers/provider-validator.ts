import type {
  ModelType,
  ProviderValidationCheck,
} from "@tasklattice/contracts";

export interface ConnectionValidationResult {
  checks: ProviderValidationCheck[];
  latencyMs: number;
  message: string;
  models: string[];
}

export interface ModelValidationInput {
  apiKey: string;
  endpoint: string;
  modelId: string;
  modelType: ModelType;
}

export interface ProviderValidator {
  validateConnection(endpoint: string, apiKey: string): Promise<ConnectionValidationResult>;
  validateModel(input: ModelValidationInput): Promise<ConnectionValidationResult>;
}

function apiUrl(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function responseError(response: Response, body: string): Error {
  const detail = body.trim().slice(0, 320);
  return new Error(
    `Provider returned ${response.status}${detail ? `: ${detail}` : "."}`,
  );
}

const passedConnectionChecks = (): ProviderValidationCheck[] => [
  { id: "endpoint", label: "Endpoint reachability", status: "PASS" },
  { id: "credentials", label: "Credential authorization", status: "PASS" },
  { id: "catalog", label: "Model catalog discovery", status: "PASS" },
];

export class OpenAICompatibleValidator implements ProviderValidator {
  async validateConnection(
    endpoint: string,
    apiKey: string,
  ): Promise<ConnectionValidationResult> {
    const startedAt = Date.now();
    const response = await fetch(apiUrl(endpoint, "models"), {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.text();
    if (!response.ok) throw responseError(response, body);
    const payload = JSON.parse(body) as { data?: Array<{ id?: unknown }> };
    const models = (payload.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string");
    if (!models.length)
      throw new Error("The Provider authenticated, but returned an empty model catalog.");
    return {
      checks: passedConnectionChecks(),
      latencyMs: Date.now() - startedAt,
      message: `Connection validated. ${models.length} models are available.`,
      models,
    };
  }

  async validateModel(input: ModelValidationInput): Promise<ConnectionValidationResult> {
    const startedAt = Date.now();
    const request = this.modelRequest(input);
    const response = await fetch(apiUrl(input.endpoint, request.path), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        ...request.headers,
      },
      body: request.body,
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok) throw responseError(response, body);
    return {
      checks: [
        ...passedConnectionChecks(),
        { id: "inference", label: `${input.modelType} capability probe`, status: "PASS" },
      ],
      latencyMs: Date.now() - startedAt,
      message: `${input.modelId} passed the ${input.modelType} capability probe.`,
      models: [input.modelId],
    };
  }

  private modelRequest(input: ModelValidationInput): {
    body: BodyInit;
    headers: Record<string, string>;
    path: string;
  } {
    if (input.modelType === "llm")
      return {
        path: "chat/completions",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.modelId,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 1,
        }),
      };
    if (input.modelType === "text-embedding")
      return {
        path: "embeddings",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: input.modelId, input: "TaskLattice validation" }),
      };

    const form = new FormData();
    form.set("model", input.modelId);
    form.set("file", new Blob([silentWav()], { type: "audio/wav" }), "validation.wav");
    return { path: "audio/transcriptions", headers: {}, body: form };
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
