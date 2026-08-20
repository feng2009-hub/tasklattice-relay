import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../http/responses";
import {
  getAuditLogService,
  requireProjectRole,
} from "../../../../../../services";
import { parseAuditLogQuery } from "../../../../../../audit-logs/audit-log-http";

export default defineHandler(async (event) => {
  try {
    await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    await requireProjectRole(event.req, ["admin"]);
    const includeSensitiveContent = new URL(event.req.url).searchParams.get(
      "include_sensitive",
    ) === "true";
    const data = await (await getAuditLogService(event.req)).list(
      parseAuditLogQuery(event.req),
      { includeSensitiveContent },
    );
    return jsonResponse(data, includeSensitiveContent
      ? { headers: { "cache-control": "no-store" } }
      : {});
  } catch (error) {
    return errorResponse(error);
  }
});
