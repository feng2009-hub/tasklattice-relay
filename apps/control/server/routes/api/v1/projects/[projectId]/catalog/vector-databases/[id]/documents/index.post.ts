import { defineHandler } from "nitro";
import { requireAuth, unauthorizedResponse } from "../../../../../../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../../../../../../http/responses";
import { getResourceCatalogService, requireProjectRole } from "../../../../../../../../../services";

const MAX_MULTIPART_BYTES = 26 * 1024 * 1024;

export default defineHandler(async (event) => {
  let actorId = "";
  try { actorId = (await requireAuth(event.req)).user.id; } catch (error) { return unauthorizedResponse(error); }
  try {
    await requireProjectRole(event.req, ["admin"]);
    const contentLength = Number(event.req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new Error("Vector Documents may not exceed 25 MiB.");
    }
    const form = await event.req.formData();
    const file = form.get("file");
    const directoryPath = form.get("directoryPath");
    const folderId = form.get("folderId");
    if (!isUploadedDocument(file)) {
      throw new Error("A Vector Document is required in the multipart file field.");
    }
    const databaseId = decodeURIComponent(event.context.params?.id ?? "");
    return jsonResponse(
      await (await getResourceCatalogService(event.req))
        .queueVectorDocument(
          databaseId,
          file,
          actorId,
          typeof directoryPath === "string" ? directoryPath : "/",
          typeof folderId === "string"
            ? folderId || null
            : undefined,
        ),
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
});

function isUploadedDocument(value: FormDataEntryValue | null): value is File {
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
