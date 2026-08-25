import type { ZodType } from "zod";
import { defineContract, type RouteContract } from "./contract";
import { departmentParamsSchema, projectParamsSchema } from "./schemas";

export const response = (description: string, schema?: ZodType, contentType?: string) => ({
  description,
  ...(schema ? { schema } : {}),
  ...(contentType ? { contentType } : {}),
});

export function route(input: Omit<RouteContract, "auth" | "description"> & {
  auth?: RouteContract["auth"];
  description?: string;
}): RouteContract {
  const { auth, description, ...contract } = input;
  return defineContract({
    ...contract,
    auth: auth ?? "session",
    description: description ?? input.summary,
  });
}

export function projectRoute(input: Omit<RouteContract, "auth" | "description" | "path"> & {
  description?: string;
  path: string;
}): RouteContract {
  return route({
    ...input,
    path: `/projects/{projectId}${input.path}`,
    request: {
      params: projectParamsSchema,
      ...input.request,
    },
  });
}

export function departmentRoute(input: Omit<RouteContract, "auth" | "description" | "path"> & {
  description?: string;
  path: string;
}): RouteContract {
  return route({
    ...input,
    path: `/departments/{departmentId}${input.path}`,
    request: {
      params: departmentParamsSchema,
      ...input.request,
    },
  });
}
