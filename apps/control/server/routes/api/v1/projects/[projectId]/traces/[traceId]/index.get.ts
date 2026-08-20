import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../auth/auth";
import { traceParamsSchema } from "../../../../../../../api-contracts/schemas";
import { errorResponse, jsonResponse, problemResponse } from "../../../../../../../http/responses";
import { requireProjectRole } from "../../../../../../../services";
import { FixtureTraceRepository } from "../../../../../../../traces/fixture-trace-repository";

const repository = new FixtureTraceRepository();

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    await requireProjectRole(event.req, ["admin", "user"]);
    const { traceId } = traceParamsSchema.parse(event.context.params);
    const trace = await repository.getById(traceId);
    return trace
      ? jsonResponse(trace)
      : problemResponse(404, "Trace not found.");
  } catch (error) {
    return errorResponse(error);
  }
});
