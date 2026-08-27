import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../../services";

const MAX_MULTIPART_BYTES = 26 * 1024 * 1024;

export default defineHandler(async (event) => {
  try { await requireAuth(event.req); } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const contentLength = Number(event.req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new Error("Invalid PDF upload: files may not exceed 25 MiB.");
    }
    const form = await event.req.formData();
    const file = form.get("file");
    if (!isUploadedPdf(file)) {
      throw new Error("Invalid PDF upload: a file is required in the multipart file field.");
    }
    const sourceId = decodeURIComponent(event.context.params?.id ?? "");
    return jsonResponse(
      await (await getResourceCatalogService(event.req))
        .ingestKnowledgePdf(sourceId, file),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
});

function isUploadedPdf(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value
    && typeof value === "object"
    && "name" in value
    && typeof value.name === "string"
    && "size" in value
    && typeof value.size === "number"
    && "type" in value
    && typeof value.type === "string"
    && "arrayBuffer" in value
    && typeof value.arrayBuffer === "function",
  );
}
