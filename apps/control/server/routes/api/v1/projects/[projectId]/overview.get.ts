import { defineHandler } from "nitro";
import { projectOverviewQuerySchema } from "../../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../http/responses";
import { getProjectOverviewService } from "../../../../../services";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const url = new URL(event.req.url);
    const query = projectOverviewQuerySchema.parse({
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
