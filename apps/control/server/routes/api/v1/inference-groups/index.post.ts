import { createInferenceGroupSchema } from "@tasklattice/contracts";
import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getInferenceGroupService } from "../../../../services";

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const group = await (await getInferenceGroupService()).create(createInferenceGroupSchema.parse(await event.req.json()));
    return jsonResponse(group, { status: 201, headers: { location: `/api/v1/inference-groups/${group.id}` } });
  } catch (error) { return errorResponse(error); }
});
