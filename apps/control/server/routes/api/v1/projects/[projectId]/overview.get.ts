import { projectOverviewRanges } from "@tali/contracts";
import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getProjectOverviewService } from "../../../../../services";

const querySchema = z.object({
  range: z.enum(projectOverviewRanges).default("7d"),
  timezone: z.string().min(1).max(80).default("UTC"),
});

export default defineHandler(async (event) => {
  try {
    requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const url = new URL(event.req.url);
    const query = querySchema.parse({
      range: url.searchParams.get("range") ?? undefined,
      timezone: url.searchParams.get("timezone") ?? undefined,
    });
    return jsonResponse(
      await (await getProjectOverviewService(event.req)).overview(query.range, query.timezone),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
