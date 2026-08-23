import { isIP } from "node:net";
import { z } from "zod";
import type {
  AgentGardenA2aProfile,
  AgentGardenEntry,
  AgentGardenSkill,
} from "@tali/contracts";

const agentCardSkillSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(32),
}).passthrough();

const agentCardSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2_000),
  version: z.string().trim().min(1).max(120),
  supportedInterfaces: z.array(z.object({
    url: z.string().trim().min(1).max(2_000),
    protocolBinding: z.string().trim().min(1).max(240),
    protocolVersion: z.string().trim().min(1).max(40),
    tenant: z.string().trim().min(1).max(240).optional(),
  }).passthrough()).min(1).max(32),
  capabilities: z.object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    extendedAgentCard: z.boolean().optional(),
  }).passthrough(),
  defaultInputModes: z.array(z.string().trim().min(1).max(200)).min(1).max(64),
  defaultOutputModes: z.array(z.string().trim().min(1).max(200)).min(1).max(64),
  skills: z.array(agentCardSkillSchema).max(1_000),
}).passthrough();

type AgentCard = z.infer<typeof agentCardSchema>;
type SupportedA2aBinding = AgentGardenA2aProfile["protocolBinding"];
const supportedA2aBindings = new Set<SupportedA2aBinding>([
  "JSONRPC",
  "HTTP+JSON",
]);

export interface AgentDiscoveryResult {
  endpoint: string;
  agentCardUrl: string;
  a2a: AgentGardenA2aProfile;
  skills: AgentGardenSkill[];
}

export interface AgentDiscoveryClient {
  discover(
    agent: AgentGardenEntry,
    credential?: string,
  ): Promise<AgentDiscoveryResult>;
}

function isObviouslyPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized === "::1"
  ) return true;
  if (isIP(normalized) === 4) {
    const [first = 0, second = 0] = normalized.split(".").map(Number);
    return first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  return isIP(normalized) === 6
    && (
      normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
    );
}

function assertEndpointPolicy(value: string, internalNetworkOnly: boolean): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Agent endpoints must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Agent endpoint credentials must use a Secret reference.");
  }
  if (!internalNetworkOnly && isObviouslyPrivateHost(url.hostname)) {
    throw new Error(
      "Private Agent endpoints must be marked as internal network only.",
    );
  }
  if (
    process.env.NODE_ENV === "production"
    && !internalNetworkOnly
    && url.protocol !== "https:"
  ) {
    throw new Error("Public Agent endpoints must use HTTPS in production.");
  }
  return url;
}

function requestHeaders(
  agent: AgentGardenEntry,
  credential?: string,
): Headers {
  const headers = new Headers({
    accept: "application/a2a+json, application/json",
  });
  if (!credential) return headers;
  if (agent.authType === "bearer_token") {
    headers.set("authorization", `Bearer ${credential}`);
  } else if (agent.authType === "api_key") {
    headers.set("x-api-key", credential);
  }
  return headers;
}

function defaultAgentCardUrl(agent: AgentGardenEntry): string | null {
  if (agent.agentCardUrl) return agent.agentCardUrl;
  if (!agent.endpoint) return null;
  return new URL("/.well-known/agent-card.json", agent.endpoint).toString();
}

function selectSupportedInterface(card: AgentCard): {
  profile: AgentGardenA2aProfile;
  url: string;
} {
  for (const candidate of card.supportedInterfaces) {
    if (
      candidate.protocolVersion !== "1.0"
      || !supportedA2aBindings.has(candidate.protocolBinding as SupportedA2aBinding)
    ) continue;
    let url: URL;
    try {
      url = new URL(candidate.url);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(url.protocol)) continue;
    return {
      url: url.toString(),
      profile: {
        protocolBinding: candidate.protocolBinding as SupportedA2aBinding,
        protocolVersion: "1.0",
        tenant: candidate.tenant ?? null,
        streaming: card.capabilities.streaming ?? false,
        pushNotifications: card.capabilities.pushNotifications ?? false,
        extendedAgentCard: card.capabilities.extendedAgentCard ?? false,
        defaultInputModes: card.defaultInputModes,
        defaultOutputModes: card.defaultOutputModes,
      },
    };
  }
  throw new Error(
    "Agent Card must advertise A2A 1.0 over JSONRPC or HTTP+JSON.",
  );
}

async function responseText(
  response: Response,
  limit = 1_000_000,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > limit) {
    throw new Error("Agent Card exceeds the one megabyte discovery limit.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > limit) {
    throw new Error("Agent Card exceeds the one megabyte discovery limit.");
  }
  return text;
}

export class HttpAgentDiscoveryClient implements AgentDiscoveryClient {
  async discover(
    agent: AgentGardenEntry,
    credential?: string,
  ): Promise<AgentDiscoveryResult> {
    const agentCardUrl = defaultAgentCardUrl(agent);
    if (!agentCardUrl) throw new Error("A2A Agent Card URL is required.");
    assertEndpointPolicy(agentCardUrl, agent.internalNetworkOnly);
    const response = await fetch(agentCardUrl, {
      headers: requestHeaders(agent, credential),
      redirect: "manual",
      signal: AbortSignal.timeout(7_000),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Agent Card redirects are not followed during discovery.");
    }
    if (!response.ok) {
      throw new Error(`Agent Card discovery failed with HTTP ${response.status}.`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await responseText(response));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Agent Card response is not valid JSON.");
      }
      throw error;
    }
    const parsed = agentCardSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
      throw new Error(
        `Agent Card does not conform to A2A 1.0${field}: ${issue?.message ?? "invalid document"}.`,
      );
    }
    const selected = selectSupportedInterface(parsed.data);
    const endpoint = agent.configuration.onboardingSource === "CONTAINER_IMAGE"
      ? agent.endpoint
      : selected.url;
    if (!endpoint) throw new Error("Managed A2A endpoint is unavailable.");
    assertEndpointPolicy(endpoint, agent.internalNetworkOnly);
    return {
      endpoint,
      agentCardUrl,
      a2a: selected.profile,
      skills: parsed.data.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
      })),
    };
  }
}
