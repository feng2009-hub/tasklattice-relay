import type { CostAnalyticsQuery, CostBreakdownQuery } from "./cost-service";
import { costCommonQuerySchema, costQuerySchemas } from "../api-contracts/schemas";

export const costGroupBySchema = costQuerySchemas.ranking.shape.group_by;

function scopedCommon(url: URL): CostAnalyticsQuery {
  const input = costCommonQuerySchema.parse({
    start_time: url.searchParams.get("start_time"),
    end_time: url.searchParams.get("end_time"),
    timezone: url.searchParams.get("timezone") ?? undefined,
    project_id: url.searchParams.get("project_id") ?? undefined,
    filters: url.searchParams.get("filters") ?? undefined,
  });
  const projectMatch = url.pathname.match(
    /^\/api\/v1\/projects\/([^/]+)(?:\/|$)/,
  );
  const projectId = projectMatch
    ? decodeURIComponent(projectMatch[1]!)
    : "default";
  if (input.project_id && input.project_id !== projectId) {
    throw new Error("Project access denied.");
  }
  return {
    startTime: input.start_time,
    endTime: input.end_time,
    timezone: input.timezone,
    projectId,
    filters: input.filters,
  };
}

export function parseCostQuery(request: Request): CostAnalyticsQuery {
  return scopedCommon(new URL(request.url));
}

export function parseGroupBy(request: Request) {
  const value = new URL(request.url).searchParams.get("group_by") ?? "instance";
  return costQuerySchemas.ranking.shape.group_by.parse(value);
}

export function parseActivityGranularity(request: Request) {
  const value = new URL(request.url).searchParams.get("granularity") ?? "daily";
  return costQuerySchemas.activity.shape.granularity.parse(value);
}

export function parseTrendGranularity(request: Request) {
  const value = new URL(request.url).searchParams.get("granularity") ?? "day";
  return costQuerySchemas.trend.shape.granularity.parse(value);
}

export function parseLimit(request: Request, name: "limit" | "top_n", fallback: number, maximum: number) {
  const raw = new URL(request.url).searchParams.get(name);
  const limitSchema = name === "top_n"
    ? costQuerySchemas.trend.shape.top_n
    : costQuerySchemas.ranking.shape.limit;
  const parsed = limitSchema.parse(raw ?? fallback);
  if (parsed > maximum) throw new Error(`${name} must be at most ${maximum}.`);
  return parsed;
}

export function parseBreakdownQuery(request: Request): CostBreakdownQuery {
  const url = new URL(request.url);
  const common = scopedCommon(url);
  const controls = costQuerySchemas.breakdown.pick({
    group_by: true,
    page: true,
    page_size: true,
    sort: true,
    direction: true,
    search: true,
  }).parse({
    group_by: url.searchParams.get("group_by") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    page_size: url.searchParams.get("page_size") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    direction: url.searchParams.get("direction") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  return {
    ...common,
    groupBy: controls.group_by,
    page: controls.page,
    pageSize: controls.page_size,
    sort: controls.sort,
    direction: controls.direction,
    search: controls.search,
  };
}
