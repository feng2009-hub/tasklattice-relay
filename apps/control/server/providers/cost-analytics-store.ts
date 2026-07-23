import { DatabaseSync } from "node:sqlite";
import type { CostGroupBy } from "@tasklattice/contracts";

export interface CostAttributionMapping {
  id: string;
  workspaceId: string;
  environmentId: string;
  instanceId: string;
  instanceName: string;
  liteLLMVirtualKeyId?: string;
  hashedToken?: string;
  virtualKeyAlias: string;
  liteLLMUserId?: string;
  liteLLMTeamId?: string;
  providerAccountId?: string;
  validFrom: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelEndpointCostMapping {
  id: string;
  modelEndpointId: string;
  modelEndpointName: string;
  liteLLMModelName?: string;
  liteLLMModelGroup?: string;
  liteLLMModelId?: string;
  provider: string;
  providerAccountId: string;
  providerAccountName: string;
  validFrom: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
}

export type CostStatus = "known" | "unknown";

export interface ModelUsageFact {
  eventId: string;
  requestId: string;
  requestStartTime: string;
  firstTokenTime?: string;
  responseEndTime?: string;
  usageDate: string;
  usageHour: number;
  workspaceId: string;
  environmentId: string;
  instanceId?: string;
  instanceName?: string;
  modelEndpointId?: string;
  modelEndpointName?: string;
  providerAccountId?: string;
  providerAccountName?: string;
  virtualKeyId?: string;
  virtualKeyAlias?: string;
  liteLLMUserId?: string;
  liteLLMTeamId?: string;
  organizationId?: string;
  endUserId?: string;
  requestedModel: string;
  resolvedModel: string;
  modelGroup: string;
  provider: string;
  callType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  reasoningTokens: number;
  promptCostUsd?: number;
  completionCostUsd?: number;
  totalCostUsd?: number;
  providerReportedCostUsd?: number;
  liteLLMCalculatedCostUsd?: number;
  costStatus: CostStatus;
  costSource: string;
  priceVersion: string;
  requestCount: 1;
  successCount: 0 | 1;
  failureCount: 0 | 1;
  latencyMs?: number;
  timeToFirstTokenMs?: number;
  httpStatusCode?: number;
  errorType?: string;
  retryCount: number;
  cacheHit: boolean;
  fallbackUsed: boolean;
  status: string;
  tags: string[];
  metadata: Record<string, unknown>;
  sourceRecordHash: string;
  correctionOfEventId?: string;
  createdAt: string;
}

export interface ModelUsageDailyRow {
  usageDate: string;
  timezone: string;
  workspaceId: string;
  environmentId: string;
  groupType: CostGroupBy;
  groupId: string;
  groupName: string;
  spendUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  successfulRequests: number;
  failedRequests: number;
  activeObjectCount: number;
  firstRequestAt: string;
  lastRequestAt: string;
}

export interface CostSyncCheckpoint {
  source: string;
  cursor?: string;
  lastSuccessfulEndTime?: string;
  lastSyncAt?: string;
  syncLagSeconds?: number;
  processedRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  lateArrivingRecords: number;
  sourceSpendUsd: number;
}

type FactQuery = {
  startTime: string;
  endTime: string;
  workspaceId: string;
  environmentId?: string;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function factFromRow(row: Record<string, unknown>): ModelUsageFact {
  return {
    eventId: String(row.event_id),
    requestId: String(row.request_id),
    requestStartTime: String(row.request_start_time),
    ...(optionalString(row.first_token_time) ? { firstTokenTime: String(row.first_token_time) } : {}),
    ...(optionalString(row.response_end_time) ? { responseEndTime: String(row.response_end_time) } : {}),
    usageDate: String(row.usage_date),
    usageHour: Number(row.usage_hour),
    workspaceId: String(row.workspace_id),
    environmentId: String(row.environment_id),
    ...(optionalString(row.instance_id) ? { instanceId: String(row.instance_id) } : {}),
    ...(optionalString(row.instance_name) ? { instanceName: String(row.instance_name) } : {}),
    ...(optionalString(row.model_endpoint_id) ? { modelEndpointId: String(row.model_endpoint_id) } : {}),
    ...(optionalString(row.model_endpoint_name) ? { modelEndpointName: String(row.model_endpoint_name) } : {}),
    ...(optionalString(row.provider_account_id) ? { providerAccountId: String(row.provider_account_id) } : {}),
    ...(optionalString(row.provider_account_name) ? { providerAccountName: String(row.provider_account_name) } : {}),
    ...(optionalString(row.virtual_key_id) ? { virtualKeyId: String(row.virtual_key_id) } : {}),
    ...(optionalString(row.virtual_key_alias) ? { virtualKeyAlias: String(row.virtual_key_alias) } : {}),
    ...(optionalString(row.litellm_user_id) ? { liteLLMUserId: String(row.litellm_user_id) } : {}),
    ...(optionalString(row.litellm_team_id) ? { liteLLMTeamId: String(row.litellm_team_id) } : {}),
    ...(optionalString(row.organization_id) ? { organizationId: String(row.organization_id) } : {}),
    ...(optionalString(row.end_user_id) ? { endUserId: String(row.end_user_id) } : {}),
    requestedModel: String(row.requested_model),
    resolvedModel: String(row.resolved_model),
    modelGroup: String(row.model_group),
    provider: String(row.provider),
    callType: String(row.call_type),
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    totalTokens: Number(row.total_tokens),
    cachedInputTokens: Number(row.cached_input_tokens),
    cacheCreationInputTokens: Number(row.cache_creation_input_tokens),
    reasoningTokens: Number(row.reasoning_tokens),
    ...(optionalNumber(row.prompt_cost_usd) !== undefined ? { promptCostUsd: Number(row.prompt_cost_usd) } : {}),
    ...(optionalNumber(row.completion_cost_usd) !== undefined ? { completionCostUsd: Number(row.completion_cost_usd) } : {}),
    ...(optionalNumber(row.total_cost_usd) !== undefined ? { totalCostUsd: Number(row.total_cost_usd) } : {}),
    ...(optionalNumber(row.provider_reported_cost_usd) !== undefined ? { providerReportedCostUsd: Number(row.provider_reported_cost_usd) } : {}),
    ...(optionalNumber(row.litellm_calculated_cost_usd) !== undefined ? { liteLLMCalculatedCostUsd: Number(row.litellm_calculated_cost_usd) } : {}),
    costStatus: row.cost_status === "known" ? "known" : "unknown",
    costSource: String(row.cost_source),
    priceVersion: String(row.price_version),
    requestCount: 1,
    successCount: Number(row.success_count) ? 1 : 0,
    failureCount: Number(row.failure_count) ? 1 : 0,
    ...(optionalNumber(row.latency_ms) !== undefined ? { latencyMs: Number(row.latency_ms) } : {}),
    ...(optionalNumber(row.time_to_first_token_ms) !== undefined ? { timeToFirstTokenMs: Number(row.time_to_first_token_ms) } : {}),
    ...(optionalNumber(row.http_status_code) !== undefined ? { httpStatusCode: Number(row.http_status_code) } : {}),
    ...(optionalString(row.error_type) ? { errorType: String(row.error_type) } : {}),
    retryCount: Number(row.retry_count),
    cacheHit: Boolean(row.cache_hit),
    fallbackUsed: Boolean(row.fallback_used),
    status: String(row.status),
    tags: JSON.parse(String(row.tags_json || "[]")) as string[],
    metadata: JSON.parse(String(row.metadata_json || "{}")) as Record<string, unknown>,
    sourceRecordHash: String(row.source_record_hash),
    ...(optionalString(row.correction_of_event_id) ? { correctionOfEventId: String(row.correction_of_event_id) } : {}),
    createdAt: String(row.created_at),
  };
}

export class CostAnalyticsStore {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS cost_attribution_mapping (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        instance_name TEXT NOT NULL,
        litellm_virtual_key_id TEXT,
        hashed_token TEXT,
        virtual_key_alias TEXT NOT NULL,
        litellm_user_id TEXT,
        litellm_team_id TEXT,
        provider_account_id TEXT,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cost_attribution_key_time
        ON cost_attribution_mapping(litellm_virtual_key_id, valid_from, valid_to);
      CREATE INDEX IF NOT EXISTS idx_cost_attribution_hash_time
        ON cost_attribution_mapping(hashed_token, valid_from, valid_to);
      CREATE INDEX IF NOT EXISTS idx_cost_attribution_user_time
        ON cost_attribution_mapping(litellm_user_id, valid_from, valid_to);

      CREATE TABLE IF NOT EXISTS model_endpoint_mapping (
        id TEXT PRIMARY KEY,
        model_endpoint_id TEXT NOT NULL,
        model_endpoint_name TEXT NOT NULL,
        litellm_model_name TEXT,
        litellm_model_group TEXT,
        litellm_model_id TEXT,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        provider_account_name TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_model_endpoint_name_time
        ON model_endpoint_mapping(litellm_model_name, valid_from, valid_to);
      CREATE INDEX IF NOT EXISTS idx_model_endpoint_group_time
        ON model_endpoint_mapping(litellm_model_group, valid_from, valid_to);
      CREATE INDEX IF NOT EXISTS idx_model_endpoint_id_time
        ON model_endpoint_mapping(litellm_model_id, valid_from, valid_to);

      CREATE TABLE IF NOT EXISTS model_usage_fact (
        event_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        request_start_time TEXT NOT NULL,
        first_token_time TEXT,
        response_end_time TEXT,
        usage_date TEXT NOT NULL,
        usage_hour INTEGER NOT NULL,
        workspace_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        instance_id TEXT,
        instance_name TEXT,
        model_endpoint_id TEXT,
        model_endpoint_name TEXT,
        provider_account_id TEXT,
        provider_account_name TEXT,
        virtual_key_id TEXT,
        virtual_key_alias TEXT,
        litellm_user_id TEXT,
        litellm_team_id TEXT,
        organization_id TEXT,
        end_user_id TEXT,
        requested_model TEXT NOT NULL,
        resolved_model TEXT NOT NULL,
        model_group TEXT NOT NULL,
        provider TEXT NOT NULL,
        call_type TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cached_input_tokens INTEGER NOT NULL,
        cache_creation_input_tokens INTEGER NOT NULL,
        reasoning_tokens INTEGER NOT NULL,
        prompt_cost_usd REAL,
        completion_cost_usd REAL,
        total_cost_usd REAL,
        provider_reported_cost_usd REAL,
        litellm_calculated_cost_usd REAL,
        cost_status TEXT NOT NULL CHECK(cost_status IN ('known', 'unknown')),
        cost_source TEXT NOT NULL,
        price_version TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1,
        success_count INTEGER NOT NULL,
        failure_count INTEGER NOT NULL,
        latency_ms REAL,
        time_to_first_token_ms REAL,
        http_status_code INTEGER,
        error_type TEXT,
        retry_count INTEGER NOT NULL,
        cache_hit INTEGER NOT NULL,
        fallback_used INTEGER NOT NULL,
        status TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        source_record_hash TEXT NOT NULL,
        correction_of_event_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_fact_scope_time
        ON model_usage_fact(workspace_id, environment_id, request_start_time);
      CREATE INDEX IF NOT EXISTS idx_usage_fact_instance_time
        ON model_usage_fact(instance_id, request_start_time);
      CREATE INDEX IF NOT EXISTS idx_usage_fact_model_time
        ON model_usage_fact(model_endpoint_id, request_start_time);
      CREATE INDEX IF NOT EXISTS idx_usage_fact_provider_account_time
        ON model_usage_fact(provider_account_id, request_start_time);
      CREATE INDEX IF NOT EXISTS idx_usage_fact_virtual_key_time
        ON model_usage_fact(virtual_key_id, request_start_time);

      CREATE TABLE IF NOT EXISTS model_usage_fact_observation (
        observation_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fact_observation_request
        ON model_usage_fact_observation(request_id);

      CREATE TABLE IF NOT EXISTS model_usage_daily (
        usage_date TEXT NOT NULL,
        timezone TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        group_type TEXT NOT NULL,
        group_id TEXT NOT NULL,
        group_name TEXT NOT NULL,
        spend_usd REAL NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        requests INTEGER NOT NULL,
        successful_requests INTEGER NOT NULL,
        failed_requests INTEGER NOT NULL,
        active_object_count INTEGER NOT NULL,
        first_request_at TEXT NOT NULL,
        last_request_at TEXT NOT NULL,
        PRIMARY KEY (usage_date, timezone, workspace_id, environment_id, group_type, group_id)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_daily_scope
        ON model_usage_daily(workspace_id, environment_id, timezone, usage_date, group_type);

      CREATE TABLE IF NOT EXISTS cost_sync_checkpoint (
        source TEXT PRIMARY KEY,
        cursor TEXT,
        last_successful_end_time TEXT,
        last_sync_at TEXT,
        sync_lag_seconds REAL,
        processed_records INTEGER NOT NULL DEFAULT 0,
        failed_records INTEGER NOT NULL DEFAULT 0,
        duplicate_records INTEGER NOT NULL DEFAULT 0,
        late_arriving_records INTEGER NOT NULL DEFAULT 0,
        source_spend_usd REAL NOT NULL DEFAULT 0
      );
    `);
  }

  saveAttribution(mapping: CostAttributionMapping): void {
    this.database.prepare(`
      INSERT INTO cost_attribution_mapping (
        id, workspace_id, environment_id, instance_id, instance_name,
        litellm_virtual_key_id, hashed_token, virtual_key_alias, litellm_user_id,
        litellm_team_id, provider_account_id, valid_from, valid_to, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        instance_name = excluded.instance_name,
        valid_to = excluded.valid_to,
        updated_at = excluded.updated_at
    `).run(
      mapping.id, mapping.workspaceId, mapping.environmentId, mapping.instanceId,
      mapping.instanceName, mapping.liteLLMVirtualKeyId ?? null, mapping.hashedToken ?? null,
      mapping.virtualKeyAlias, mapping.liteLLMUserId ?? null, mapping.liteLLMTeamId ?? null,
      mapping.providerAccountId ?? null, mapping.validFrom, mapping.validTo ?? null,
      mapping.createdAt, mapping.updatedAt,
    );
  }

  saveModelEndpointMapping(mapping: ModelEndpointCostMapping): void {
    this.database.prepare(`
      INSERT INTO model_endpoint_mapping (
        id, model_endpoint_id, model_endpoint_name, litellm_model_name,
        litellm_model_group, litellm_model_id, provider, provider_account_id,
        provider_account_name, valid_from, valid_to, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        model_endpoint_name = excluded.model_endpoint_name,
        provider_account_name = excluded.provider_account_name,
        valid_to = excluded.valid_to,
        updated_at = excluded.updated_at
    `).run(
      mapping.id, mapping.modelEndpointId, mapping.modelEndpointName,
      mapping.liteLLMModelName ?? null, mapping.liteLLMModelGroup ?? null,
      mapping.liteLLMModelId ?? null, mapping.provider, mapping.providerAccountId,
      mapping.providerAccountName, mapping.validFrom, mapping.validTo ?? null,
      mapping.createdAt, mapping.updatedAt,
    );
  }

  findAttribution(input: {
    virtualKeyId?: string;
    hashedToken?: string;
    userId?: string;
    teamId?: string;
    at: string;
  }): CostAttributionMapping | undefined {
    const row = this.database.prepare(`
      SELECT * FROM cost_attribution_mapping
      WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
        AND (
          (? IS NOT NULL AND litellm_virtual_key_id = ?)
          OR (? IS NOT NULL AND hashed_token = ?)
          OR (? IS NOT NULL AND litellm_user_id = ?)
          OR (? IS NOT NULL AND litellm_team_id = ?)
        )
      ORDER BY
        CASE WHEN litellm_virtual_key_id = ? THEN 0
             WHEN hashed_token = ? THEN 1
             WHEN litellm_user_id = ? THEN 2 ELSE 3 END,
        valid_from DESC
      LIMIT 1
    `).get(
      input.at, input.at,
      input.virtualKeyId ?? null, input.virtualKeyId ?? null,
      input.hashedToken ?? null, input.hashedToken ?? null,
      input.userId ?? null, input.userId ?? null,
      input.teamId ?? null, input.teamId ?? null,
      input.virtualKeyId ?? null, input.hashedToken ?? null, input.userId ?? null,
    ) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      environmentId: String(row.environment_id),
      instanceId: String(row.instance_id),
      instanceName: String(row.instance_name),
      ...(optionalString(row.litellm_virtual_key_id) ? { liteLLMVirtualKeyId: String(row.litellm_virtual_key_id) } : {}),
      ...(optionalString(row.hashed_token) ? { hashedToken: String(row.hashed_token) } : {}),
      virtualKeyAlias: String(row.virtual_key_alias),
      ...(optionalString(row.litellm_user_id) ? { liteLLMUserId: String(row.litellm_user_id) } : {}),
      ...(optionalString(row.litellm_team_id) ? { liteLLMTeamId: String(row.litellm_team_id) } : {}),
      ...(optionalString(row.provider_account_id) ? { providerAccountId: String(row.provider_account_id) } : {}),
      validFrom: String(row.valid_from),
      ...(optionalString(row.valid_to) ? { validTo: String(row.valid_to) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  findModelEndpoint(input: {
    modelName?: string;
    modelGroup?: string;
    modelId?: string;
    at: string;
  }): ModelEndpointCostMapping | undefined {
    const row = this.database.prepare(`
      SELECT * FROM model_endpoint_mapping
      WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
        AND (
          (? IS NOT NULL AND litellm_model_name = ?)
          OR (? IS NOT NULL AND litellm_model_group = ?)
          OR (? IS NOT NULL AND litellm_model_id = ?)
        )
      ORDER BY valid_from DESC
      LIMIT 1
    `).get(
      input.at, input.at,
      input.modelName ?? null, input.modelName ?? null,
      input.modelGroup ?? null, input.modelGroup ?? null,
      input.modelId ?? null, input.modelId ?? null,
    ) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      modelEndpointId: String(row.model_endpoint_id),
      modelEndpointName: String(row.model_endpoint_name),
      ...(optionalString(row.litellm_model_name) ? { liteLLMModelName: String(row.litellm_model_name) } : {}),
      ...(optionalString(row.litellm_model_group) ? { liteLLMModelGroup: String(row.litellm_model_group) } : {}),
      ...(optionalString(row.litellm_model_id) ? { liteLLMModelId: String(row.litellm_model_id) } : {}),
      provider: String(row.provider),
      providerAccountId: String(row.provider_account_id),
      providerAccountName: String(row.provider_account_name),
      validFrom: String(row.valid_from),
      ...(optionalString(row.valid_to) ? { validTo: String(row.valid_to) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  insertFact(fact: ModelUsageFact): boolean {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO model_usage_fact (
        event_id, request_id, request_start_time, first_token_time, response_end_time,
        usage_date, usage_hour, workspace_id, environment_id, instance_id, instance_name,
        model_endpoint_id, model_endpoint_name, provider_account_id, provider_account_name,
        virtual_key_id, virtual_key_alias, litellm_user_id, litellm_team_id, organization_id,
        end_user_id, requested_model, resolved_model, model_group, provider, call_type,
        prompt_tokens, completion_tokens, total_tokens, cached_input_tokens,
        cache_creation_input_tokens, reasoning_tokens, prompt_cost_usd, completion_cost_usd,
        total_cost_usd, provider_reported_cost_usd, litellm_calculated_cost_usd,
        cost_status, cost_source, price_version, request_count, success_count, failure_count,
        latency_ms, time_to_first_token_ms, http_status_code, error_type, retry_count,
        cache_hit, fallback_used, status, tags_json, metadata_json, source_record_hash,
        correction_of_event_id, created_at
      ) VALUES (${Array.from({ length: 56 }, () => "?").join(",")})
    `).run(
      fact.eventId, fact.requestId, fact.requestStartTime, fact.firstTokenTime ?? null,
      fact.responseEndTime ?? null, fact.usageDate, fact.usageHour, fact.workspaceId,
      fact.environmentId, fact.instanceId ?? null, fact.instanceName ?? null,
      fact.modelEndpointId ?? null, fact.modelEndpointName ?? null,
      fact.providerAccountId ?? null, fact.providerAccountName ?? null,
      fact.virtualKeyId ?? null, fact.virtualKeyAlias ?? null, fact.liteLLMUserId ?? null,
      fact.liteLLMTeamId ?? null, fact.organizationId ?? null, fact.endUserId ?? null,
      fact.requestedModel, fact.resolvedModel, fact.modelGroup, fact.provider, fact.callType,
      fact.promptTokens, fact.completionTokens, fact.totalTokens, fact.cachedInputTokens,
      fact.cacheCreationInputTokens, fact.reasoningTokens, fact.promptCostUsd ?? null,
      fact.completionCostUsd ?? null, fact.totalCostUsd ?? null,
      fact.providerReportedCostUsd ?? null, fact.liteLLMCalculatedCostUsd ?? null,
      fact.costStatus, fact.costSource, fact.priceVersion, 1, fact.successCount,
      fact.failureCount, fact.latencyMs ?? null, fact.timeToFirstTokenMs ?? null,
      fact.httpStatusCode ?? null, fact.errorType ?? null, fact.retryCount,
      fact.cacheHit ? 1 : 0, fact.fallbackUsed ? 1 : 0, fact.status,
      JSON.stringify(fact.tags), JSON.stringify(fact.metadata), fact.sourceRecordHash,
      fact.correctionOfEventId ?? null, fact.createdAt,
    );
    return result.changes > 0;
  }

  recordObservation(input: {
    observationId: string;
    requestId: string;
    observedAt: string;
    reason: string;
    payload: unknown;
  }): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO model_usage_fact_observation
        (observation_id, request_id, observed_at, reason, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.observationId, input.requestId, input.observedAt, input.reason, JSON.stringify(input.payload));
  }

  listFacts(query: FactQuery): ModelUsageFact[] {
    const rows = this.database.prepare(`
      SELECT * FROM model_usage_fact
      WHERE workspace_id = ?
        AND (? IS NULL OR environment_id = ?)
        AND request_start_time >= ?
        AND request_start_time <= ?
      ORDER BY request_start_time, event_id
    `).all(
      query.workspaceId,
      query.environmentId ?? null,
      query.environmentId ?? null,
      query.startTime,
      query.endTime,
    ) as Array<Record<string, unknown>>;
    return rows.map(factFromRow);
  }

  replaceDailyRows(input: {
    workspaceId: string;
    environmentId: string;
    timezone: string;
    from: string;
    to: string;
    rows: ModelUsageDailyRow[];
  }): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        DELETE FROM model_usage_daily
        WHERE workspace_id = ? AND environment_id = ? AND timezone = ?
          AND usage_date >= ? AND usage_date <= ?
      `).run(input.workspaceId, input.environmentId, input.timezone, input.from, input.to);
      const insert = this.database.prepare(`
        INSERT INTO model_usage_daily (
          usage_date, timezone, workspace_id, environment_id, group_type, group_id,
          group_name, spend_usd, prompt_tokens, completion_tokens, total_tokens,
          requests, successful_requests, failed_requests, active_object_count,
          first_request_at, last_request_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of input.rows) {
        insert.run(
          row.usageDate, row.timezone, row.workspaceId, row.environmentId,
          row.groupType, row.groupId, row.groupName, row.spendUsd, row.promptTokens,
          row.completionTokens, row.totalTokens, row.requests, row.successfulRequests,
          row.failedRequests, row.activeObjectCount, row.firstRequestAt, row.lastRequestAt,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listDailyRows(input: {
    workspaceId: string;
    environmentId: string;
    timezone: string;
    from: string;
    to: string;
    groupType: CostGroupBy;
  }): ModelUsageDailyRow[] {
    const rows = this.database.prepare(`
      SELECT * FROM model_usage_daily
      WHERE workspace_id = ? AND environment_id = ? AND timezone = ?
        AND usage_date >= ? AND usage_date <= ? AND group_type = ?
      ORDER BY usage_date, spend_usd DESC
    `).all(
      input.workspaceId, input.environmentId, input.timezone,
      input.from, input.to, input.groupType,
    ) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      usageDate: String(row.usage_date),
      timezone: String(row.timezone),
      workspaceId: String(row.workspace_id),
      environmentId: String(row.environment_id),
      groupType: String(row.group_type) as CostGroupBy,
      groupId: String(row.group_id),
      groupName: String(row.group_name),
      spendUsd: Number(row.spend_usd),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      totalTokens: Number(row.total_tokens),
      requests: Number(row.requests),
      successfulRequests: Number(row.successful_requests),
      failedRequests: Number(row.failed_requests),
      activeObjectCount: Number(row.active_object_count),
      firstRequestAt: String(row.first_request_at),
      lastRequestAt: String(row.last_request_at),
    }));
  }

  checkpoint(source = "litellm"): CostSyncCheckpoint {
    const row = this.database.prepare(
      "SELECT * FROM cost_sync_checkpoint WHERE source = ?",
    ).get(source) as Record<string, unknown> | undefined;
    return {
      source,
      ...(optionalString(row?.cursor) ? { cursor: String(row?.cursor) } : {}),
      ...(optionalString(row?.last_successful_end_time) ? { lastSuccessfulEndTime: String(row?.last_successful_end_time) } : {}),
      ...(optionalString(row?.last_sync_at) ? { lastSyncAt: String(row?.last_sync_at) } : {}),
      ...(optionalNumber(row?.sync_lag_seconds) !== undefined ? { syncLagSeconds: Number(row?.sync_lag_seconds) } : {}),
      processedRecords: Number(row?.processed_records ?? 0),
      failedRecords: Number(row?.failed_records ?? 0),
      duplicateRecords: Number(row?.duplicate_records ?? 0),
      lateArrivingRecords: Number(row?.late_arriving_records ?? 0),
      sourceSpendUsd: Number(row?.source_spend_usd ?? 0),
    };
  }

  saveCheckpoint(checkpoint: CostSyncCheckpoint): void {
    this.database.prepare(`
      INSERT INTO cost_sync_checkpoint (
        source, cursor, last_successful_end_time, last_sync_at, sync_lag_seconds,
        processed_records, failed_records, duplicate_records, late_arriving_records,
        source_spend_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        cursor = excluded.cursor,
        last_successful_end_time = excluded.last_successful_end_time,
        last_sync_at = excluded.last_sync_at,
        sync_lag_seconds = excluded.sync_lag_seconds,
        processed_records = excluded.processed_records,
        failed_records = excluded.failed_records,
        duplicate_records = excluded.duplicate_records,
        late_arriving_records = excluded.late_arriving_records,
        source_spend_usd = excluded.source_spend_usd
    `).run(
      checkpoint.source, checkpoint.cursor ?? null,
      checkpoint.lastSuccessfulEndTime ?? null, checkpoint.lastSyncAt ?? null,
      checkpoint.syncLagSeconds ?? null, checkpoint.processedRecords,
      checkpoint.failedRecords, checkpoint.duplicateRecords,
      checkpoint.lateArrivingRecords, checkpoint.sourceSpendUsd,
    );
  }

  countDuplicateRequests(): number {
    const row = this.database.prepare(`
      SELECT COUNT(DISTINCT request_id) AS count
      FROM model_usage_fact_observation WHERE reason = 'duplicate_request_id'
    `).get() as { count: number };
    return Number(row.count);
  }
}
