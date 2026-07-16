import { defineHandler } from "nitro";
import { z } from "zod";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { getCostService } from "../../../../services";

const date = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({ from: z.string().regex(date), to: z.string().regex(date) });

export default defineHandler(async (event) => {
  try { requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    const url = new URL(event.req.url);
    const input = querySchema.parse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    return jsonResponse(await (await getCostService()).report(input.from, input.to));
  } catch (error) { return errorResponse(error); }
});
