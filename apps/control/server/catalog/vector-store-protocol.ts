import { z } from "zod";

export const vectorStoreSearchRequestSchema = z.object({
  query: z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1),
  ]),
  filters: z.record(z.string(), z.unknown()).nullish(),
  max_num_results: z.number().int().min(1).max(50).nullish(),
  ranking_options: z.record(z.string(), z.unknown()).nullish(),
  rewrite_query: z.boolean().nullish(),
}).strict();

export type VectorStoreSearchRequest = z.infer<typeof vectorStoreSearchRequestSchema>;

export interface VectorStoreSearchResponse {
  object: "vector_store.search_results.page";
  search_query: string;
  data: Array<{
    score: number;
    content: Array<{ type: "text"; text: string }>;
    file_id: string;
    filename: string;
    attributes: Record<string, unknown>;
  }>;
}

export function vectorStoreSearchQuery(request: VectorStoreSearchRequest): string {
  return Array.isArray(request.query)
    ? request.query.join("\n")
    : request.query;
}
