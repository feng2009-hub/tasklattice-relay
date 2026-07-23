import { afterEach, describe, expect, it } from "vitest";
import { parseBreakdownQuery, parseCostQuery } from "./cost-request";

const originalWorkspace = process.env.TALI_WORKSPACE_ID;
const originalEnvironment = process.env.TALI_ENVIRONMENT_ID;

afterEach(() => {
  if (originalWorkspace === undefined) delete process.env.TALI_WORKSPACE_ID;
  else process.env.TALI_WORKSPACE_ID = originalWorkspace;
  if (originalEnvironment === undefined) delete process.env.TALI_ENVIRONMENT_ID;
  else process.env.TALI_ENVIRONMENT_ID = originalEnvironment;
});

describe("cost request parsing", () => {
  it("accepts stable snake_case parameters and applies configured scope", () => {
    process.env.TALI_WORKSPACE_ID = "workspace-a";
    process.env.TALI_ENVIRONMENT_ID = "production";
    const request = new Request(
      "http://localhost/api/v1/costs/breakdown" +
      "?start_time=2026-06-01&end_time=2026-06-30&timezone=Asia%2FShanghai" +
      "&workspace_id=workspace-a&environment_id=production&group_by=model_endpoint" +
      "&page=2&page_size=50&sort=requests&direction=asc&search=gpt" +
      `&filters=${encodeURIComponent(JSON.stringify({ provider: ["OpenAI"] }))}`,
    );

    expect(parseBreakdownQuery(request)).toMatchObject({
      startTime: "2026-06-01",
      endTime: "2026-06-30",
      timezone: "Asia/Shanghai",
      workspaceId: "workspace-a",
      environmentId: "production",
      groupBy: "model_endpoint",
      page: 2,
      pageSize: 50,
      sort: "requests",
      direction: "asc",
      search: "gpt",
      filters: { provider: ["OpenAI"] },
    });
  });

  it("rejects cross-workspace scope and malformed filters", () => {
    process.env.TALI_WORKSPACE_ID = "workspace-a";
    expect(() => parseCostQuery(new Request(
      "http://localhost/api/v1/costs/summary?start_time=2026-06-01&end_time=2026-06-30&workspace_id=workspace-b",
    ))).toThrow("Workspace access denied");
    expect(() => parseCostQuery(new Request(
      "http://localhost/api/v1/costs/summary?start_time=2026-06-01&end_time=2026-06-30&filters=not-json",
    ))).toThrow();
  });
});
