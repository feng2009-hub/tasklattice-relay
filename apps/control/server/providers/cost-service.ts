import type { CostBreakdownItem, CostReport } from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { LiteLLMClient, type LiteLLMAdminClient, type LiteLLMSpendLog } from "./litellm-client";

type MutableBreakdown = CostBreakdownItem;

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateKey(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
}

function add(
  map: Map<string, MutableBreakdown>,
  key: string,
  label: string,
  detail: string,
  log: LiteLLMSpendLog,
): void {
  const current = map.get(key) ?? {
    id: key,
    label,
    detail,
    spend: 0,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  current.spend += number(log.spend);
  current.requests += 1;
  current.inputTokens += number(log.prompt_tokens);
  current.outputTokens += number(log.completion_tokens);
  map.set(key, current);
}

export class CostService {
  constructor(
    readonly store = new AgentStore(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {}

  async report(from: string, to: string): Promise<CostReport> {
    const logs = await this.litellm.listSpendLogs(from, to);
    const agents = new Map(this.store.list().map((agent) => [agent.id, agent]));
    const deployments = new Map(
      this.store.listModelDeployments().map((deployment) => [deployment.litellmModelName, deployment]),
    );
    const byInstance = new Map<string, MutableBreakdown>();
    const byModel = new Map<string, MutableBreakdown>();
    const daily = new Map<string, number>();

    for (const log of logs) {
      const agentId = log.end_user || log.user || "unassigned";
      const agent = agents.get(agentId);
      add(
        byInstance,
        agentId,
        agent?.name ?? "Unassigned request",
        agent?.sandboxName ?? agentId,
        log,
      );

      const modelName = log.model_group || log.model || "unknown-model";
      const deployment = deployments.get(modelName);
      add(
        byModel,
        modelName,
        deployment?.displayName ?? modelName,
        deployment
          ? `${deployment.providerName} · ${new URL(deployment.endpoint).host}`
          : "Unregistered LiteLLM model",
        log,
      );

      const date = dateKey(log.startTime ?? log.start_time, from);
      daily.set(date, (daily.get(date) ?? 0) + number(log.spend));
    }

    const sort = (items: Map<string, MutableBreakdown>) =>
      [...items.values()].sort((a, b) => b.spend - a.spend);
    return {
      currency: "USD",
      from,
      to,
      totalSpend: logs.reduce((sum, log) => sum + number(log.spend), 0),
      requestCount: logs.length,
      inputTokens: logs.reduce((sum, log) => sum + number(log.prompt_tokens), 0),
      outputTokens: logs.reduce((sum, log) => sum + number(log.completion_tokens), 0),
      byInstance: sort(byInstance),
      byModel: sort(byModel),
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, spend]) => ({ date, spend })),
    };
  }
}
