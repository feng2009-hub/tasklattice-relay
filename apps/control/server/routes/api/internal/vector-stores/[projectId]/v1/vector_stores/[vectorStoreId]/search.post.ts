import { defineHandler } from "nitro";
import { ElasticsearchVectorStoreBridge } from "../../../../../../../../catalog/elasticsearch-vector-store-bridge";
import { KnowledgeVectorDatabase } from "../../../../../../../../catalog/knowledge-vector-database";
import { isVectorStoreBridgeAuthorized } from "../../../../../../../../catalog/vector-store-bridge-auth";
import { errorResponse, jsonResponse } from "../../../../../../../../http/responses";
import { ProjectStore } from "../../../../../../../../projects/project-store";
import { LiteLLMClient } from "../../../../../../../../providers/litellm-client";

export default defineHandler(async (event) => {
  if (!isVectorStoreBridgeAuthorized(event.req.headers.get("authorization"))) {
    return jsonResponse({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const projectId = decodeURIComponent(event.context.params?.projectId ?? "");
    const vectorStoreId = decodeURIComponent(event.context.params?.vectorStoreId ?? "");
    if (!projectId || !vectorStoreId) {
      return jsonResponse({ error: "Project and Vector Store IDs are required." }, { status: 400 });
    }
    const store = new ProjectStore(projectId);
    const source = (await store.listKnowledgeSourceDefinitions())
      .find((candidate) => candidate.vectorStoreId === vectorStoreId);
    const body = await event.req.json();
    if (source?.provider === "elasticsearch") {
      return jsonResponse(
        await new ElasticsearchVectorStoreBridge(store).search(vectorStoreId, body),
      );
    }
    if (source?.provider === "postgresql") {
      return jsonResponse(
        await new KnowledgeVectorDatabase(store, new LiteLLMClient())
          .search(vectorStoreId, body),
      );
    }
    throw new Error("An internal Vector Store bridge was not found.");
  } catch (error) {
    return errorResponse(error);
  }
});
