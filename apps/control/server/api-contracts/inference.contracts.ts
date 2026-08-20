import {
  createModelDeploymentSchema,
  createModelRoutingSchema,
  createProviderConnectionSchema,
  createSandboxPolicySchema,
  discoverProviderModelsSchema,
  sandboxPolicyInputSchema,
  updateModelRoutingSchema,
  updateProjectQuotaSchema,
  updateSandboxPolicySchema,
} from "@tali/contracts";
import { z } from "zod";
import { defineContracts } from "./contract";
import { projectRoute, response } from "./helpers";
import {
  costQuerySchemas,
  domainCollectionSchema,
  modelParamsSchema,
  openObjectSchema,
  projectParamsSchema,
  providerParamsSchema,
  routingParamsSchema,
  runtimePolicyParamsSchema,
} from "./schemas";

const providerCollectionSchema = z.looseObject({
  data: domainCollectionSchema,
}).meta({ id: "ProviderCollection" });
const runtimePolicySchema = sandboxPolicyInputSchema.and(z.looseObject({ id: z.string() }))
  .meta({ id: "RuntimePolicy" });
const modelDeploymentSchema = createModelDeploymentSchema.and(z.looseObject({ id: z.string().uuid() }))
  .meta({ id: "ModelDeployment" });
const modelRoutingSchema = z.looseObject({ id: z.string().uuid(), name: z.string() })
  .meta({ id: "ModelRouting" });

export const inferenceContracts = defineContracts([
  projectRoute({
    method: "get", path: "/providers", operationId: "listProviderAccounts",
    summary: "List provider accounts", tags: ["Providers"],
    responses: { 200: response("Provider account collection", providerCollectionSchema) },
  }),
  projectRoute({
    method: "post", path: "/providers", operationId: "createProviderAccount",
    summary: "Create a provider account", tags: ["Providers"],
    request: { body: createProviderConnectionSchema },
    responses: { 201: response("Created provider account", openObjectSchema) },
  }),
  projectRoute({
    method: "post", path: "/providers/discover", operationId: "discoverProviderModels",
    summary: "Discover provider models before registration", tags: ["Providers"],
    request: { body: discoverProviderModelsSchema },
    responses: { 200: response("Provider model discovery", openObjectSchema) },
  }),
  projectRoute({
    method: "post", path: "/providers/{providerId}/validate", operationId: "validateProviderAccount",
    summary: "Validate a provider account", tags: ["Providers"],
    request: { params: providerParamsSchema },
    responses: { 200: response("Validated provider account", openObjectSchema) },
  }),
  projectRoute({
    method: "post", path: "/providers/{providerId}/discover", operationId: "discoverProviderAccountModels",
    summary: "Discover models for a registered provider account", tags: ["Providers"],
    request: { params: providerParamsSchema },
    responses: { 200: response("Provider model discovery", openObjectSchema) },
  }),
  projectRoute({
    method: "delete", path: "/providers/{providerId}", operationId: "deleteProviderAccount",
    summary: "Delete a provider account", tags: ["Providers"],
    request: { params: providerParamsSchema },
    responses: { 200: response("Deleted provider account", openObjectSchema) },
  }),
  projectRoute({
    method: "get", path: "/models", operationId: "listModelDeployments",
    summary: "List model deployments", tags: ["Models"],
    responses: { 200: response("Model deployment list", z.object({ data: z.array(modelDeploymentSchema) })) },
  }),
  projectRoute({
    method: "post", path: "/models", operationId: "createModelDeployment",
    summary: "Create a model deployment", tags: ["Models"],
    request: { body: createModelDeploymentSchema },
    responses: { 201: response("Created model deployment", modelDeploymentSchema) },
  }),
  projectRoute({
    method: "delete", path: "/models/{modelId}", operationId: "deleteModelDeployment",
    summary: "Delete a model deployment", tags: ["Models"],
    request: { params: modelParamsSchema },
    responses: { 200: response("Deleted model deployment", openObjectSchema) },
  }),
  projectRoute({
    method: "get", path: "/inference-gateways", operationId: "listInferenceGateways",
    summary: "List inference gateways", tags: ["Inference gateways"],
    responses: { 200: response("Inference gateway list", z.object({ data: domainCollectionSchema })) },
  }),
  projectRoute({
    method: "get", path: "/model-routings", operationId: "listModelRoutings",
    summary: "List model routings", tags: ["Model routing"],
    responses: { 200: response("Model routing list", z.object({ data: z.array(modelRoutingSchema) })) },
  }),
  projectRoute({
    method: "post", path: "/model-routings", operationId: "createModelRouting",
    summary: "Create a model routing", tags: ["Model routing"],
    request: { body: createModelRoutingSchema },
    responses: { 201: response("Created model routing", modelRoutingSchema) },
  }),
  projectRoute({
    method: "get", path: "/model-routings/{routingId}", operationId: "getModelRouting",
    summary: "Read a model routing", tags: ["Model routing"], request: { params: routingParamsSchema },
    responses: { 200: response("Model routing", modelRoutingSchema) },
  }),
  projectRoute({
    method: "put", path: "/model-routings/{routingId}", operationId: "updateModelRouting",
    summary: "Update a model routing", tags: ["Model routing"],
    request: { params: routingParamsSchema, body: updateModelRoutingSchema },
    responses: { 200: response("Updated model routing", modelRoutingSchema) },
  }),
  projectRoute({
    method: "delete", path: "/model-routings/{routingId}", operationId: "deleteModelRouting",
    summary: "Delete a model routing", tags: ["Model routing"], request: { params: routingParamsSchema },
    responses: { 200: response("Deleted model routing", openObjectSchema) },
  }),
  projectRoute({
    method: "post", path: "/model-routings/{routingId}/refresh", operationId: "refreshModelRouting",
    summary: "Refresh a model routing", tags: ["Model routing"], request: { params: routingParamsSchema },
    responses: { 200: response("Refreshed model routing", modelRoutingSchema) },
  }),
  projectRoute({
    method: "get", path: "/model-routings/{routingId}/consumers", operationId: "listModelRoutingConsumers",
    summary: "List model routing consumers", tags: ["Model routing"], request: { params: routingParamsSchema },
    responses: { 200: response("Model routing consumer list", z.object({ data: domainCollectionSchema })) },
  }),
  projectRoute({
    method: "get", path: "/model-routings/{routingId}/audit", operationId: "listModelRoutingAuditEvents",
    summary: "List model routing audit events", tags: ["Model routing"], request: { params: routingParamsSchema },
    responses: { 200: response("Model routing audit events", z.object({ data: domainCollectionSchema })) },
  }),
  projectRoute({
    method: "get", path: "/quota", operationId: "getProjectQuota", summary: "Read Project quota",
    tags: ["Quota"], responses: { 200: response("Project quota", openObjectSchema) },
  }),
  projectRoute({
    method: "put", path: "/quota", operationId: "updateProjectQuota", summary: "Update Project quota",
    tags: ["Quota"], request: { body: updateProjectQuotaSchema },
    responses: { 200: response("Updated Project quota", openObjectSchema) },
  }),
  ...(["summary", "activity", "insights", "ranking", "trend", "breakdown", "data-quality"] as const)
    .map((name) => projectRoute({
      method: "get",
      path: `/costs/${name}`,
      operationId: `getCost${name.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}`,
      summary: `Read cost ${name.replace("-", " ")}`,
      tags: ["Costs"],
      request: { params: projectParamsSchema, query: costQuerySchemas[name] },
      responses: { 200: response(`Cost ${name.replace("-", " ")}`, openObjectSchema) },
    })),
  projectRoute({
    method: "get", path: "/runtime-policies", operationId: "listRuntimePolicies",
    summary: "List runtime policies", tags: ["Runtime policies"],
    responses: { 200: response("Runtime policy catalog", z.looseObject({
      defaultPolicyId: z.string(),
      templatePolicyYaml: z.string(),
      data: z.array(runtimePolicySchema),
    })) },
  }),
  projectRoute({
    method: "post", path: "/runtime-policies", operationId: "createRuntimePolicy",
    summary: "Create a runtime policy", tags: ["Runtime policies"], request: { body: createSandboxPolicySchema },
    responses: { 201: response("Created runtime policy", runtimePolicySchema) },
  }),
  projectRoute({
    method: "put", path: "/runtime-policies/{policyId}", operationId: "updateRuntimePolicy",
    summary: "Update a runtime policy", tags: ["Runtime policies"],
    request: { params: runtimePolicyParamsSchema, body: updateSandboxPolicySchema },
    responses: { 200: response("Updated runtime policy", runtimePolicySchema) },
  }),
  projectRoute({
    method: "delete", path: "/runtime-policies/{policyId}", operationId: "deleteRuntimePolicy",
    summary: "Delete a runtime policy", tags: ["Runtime policies"], request: { params: runtimePolicyParamsSchema },
    responses: { 200: response("Deleted runtime policy", openObjectSchema) },
  }),
  projectRoute({
    method: "get", path: "/runtime", operationId: "getRuntimeStatus", summary: "Read runtime status",
    tags: ["Runtime"], responses: { 200: response("Runtime status", openObjectSchema) },
  }),
]);
