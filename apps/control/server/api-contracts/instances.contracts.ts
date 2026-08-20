import {
  createAccessPolicySchema,
  createInstanceSchema,
  createTerminalSessionInputSchema,
  updateAccessPolicySchema,
  updateInstanceAccessPoliciesSchema,
} from "@tali/contracts";
import { z } from "zod";
import { defineContracts } from "./contract";
import { projectRoute, response } from "./helpers";
import {
  accessPolicyParamsSchema,
  auditQuerySchema,
  domainCollectionSchema,
  instanceParamsSchema,
  openObjectSchema,
  traceListSchema,
  traceParamsSchema,
  traceSchema,
} from "./schemas";

const accessPolicySchema = createAccessPolicySchema.and(z.looseObject({
  id: z.string().uuid(),
  version: z.number().int().positive(),
})).meta({ id: "AccessPolicy" });
const instanceSchema = z.looseObject({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
}).meta({ id: "Instance" });

export const instanceContracts = defineContracts([
  projectRoute({
    method: "get", path: "/access-policies", operationId: "listAccessPolicies",
    summary: "List access policies", tags: ["Access policies"],
    responses: { 200: response("Access policy list", z.object({ data: z.array(accessPolicySchema) })) },
  }),
  projectRoute({
    method: "post", path: "/access-policies", operationId: "createAccessPolicy",
    summary: "Create an access policy", tags: ["Access policies"], request: { body: createAccessPolicySchema },
    responses: { 201: response("Created access policy", accessPolicySchema) },
  }),
  projectRoute({
    method: "get", path: "/access-policies/{policyId}", operationId: "getAccessPolicy",
    summary: "Read an access policy", tags: ["Access policies"], request: { params: accessPolicyParamsSchema },
    responses: { 200: response("Access policy", accessPolicySchema) },
  }),
  projectRoute({
    method: "put", path: "/access-policies/{policyId}", operationId: "updateAccessPolicy",
    summary: "Update an access policy", tags: ["Access policies"],
    request: { params: accessPolicyParamsSchema, body: updateAccessPolicySchema },
    responses: { 200: response("Updated access policy", accessPolicySchema) },
  }),
  projectRoute({
    method: "delete", path: "/access-policies/{policyId}", operationId: "deleteAccessPolicy",
    summary: "Delete an access policy", tags: ["Access policies"], request: { params: accessPolicyParamsSchema },
    responses: { 204: response("Access policy deleted") },
  }),
  projectRoute({
    method: "get", path: "/access-policies/{policyId}/versions", operationId: "listAccessPolicyVersions",
    summary: "List access policy versions", tags: ["Access policies"], request: { params: accessPolicyParamsSchema },
    responses: { 200: response("Access policy versions", z.object({ data: domainCollectionSchema })) },
  }),
  projectRoute({
    method: "get", path: "/instances", operationId: "listInstances",
    summary: "List runtime Instances", tags: ["Instances"],
    responses: { 200: response("Instance list", z.object({ data: z.array(instanceSchema) })) },
  }),
  projectRoute({
    method: "post", path: "/instances", operationId: "createInstance",
    summary: "Create a runtime Instance", tags: ["Instances"], request: { body: createInstanceSchema },
    responses: { 202: response("Instance provisioning accepted", instanceSchema) },
  }),
  projectRoute({
    method: "get", path: "/instances/{instanceId}", operationId: "getInstance",
    summary: "Read a runtime Instance", tags: ["Instances"], request: { params: instanceParamsSchema },
    responses: { 200: response("Instance", instanceSchema) },
  }),
  projectRoute({
    method: "delete", path: "/instances/{instanceId}", operationId: "deleteInstance",
    summary: "Delete a runtime Instance", tags: ["Instances"], request: { params: instanceParamsSchema },
    responses: { 202: response("Instance deletion accepted", openObjectSchema) },
  }),
  projectRoute({
    method: "put", path: "/instances/{instanceId}/access-policies", operationId: "updateInstanceAccessPolicies",
    summary: "Update Instance access policies", tags: ["Instances"],
    request: { params: instanceParamsSchema, body: updateInstanceAccessPoliciesSchema },
    responses: { 200: response("Updated Instance", instanceSchema) },
  }),
  projectRoute({
    method: "get", path: "/instances/{instanceId}/interaction", operationId: "getInstanceInteraction",
    summary: "Read Instance interaction access", tags: ["Instances"], request: { params: instanceParamsSchema },
    responses: { 200: response("Instance interaction access", openObjectSchema) },
  }),
  projectRoute({
    method: "get", path: "/instances/{instanceId}/logs", operationId: "getInstanceLogs",
    summary: "Read Instance runtime logs", tags: ["Instances"], request: { params: instanceParamsSchema },
    responses: { 200: response("Instance runtime logs", openObjectSchema) },
  }),
  projectRoute({
    method: "post", path: "/instances/{instanceId}/terminal-sessions", operationId: "createInstanceTerminalSession",
    summary: "Create an Instance terminal session", tags: ["Instances"],
    request: { params: instanceParamsSchema, body: createTerminalSessionInputSchema },
    responses: { 201: response("Created terminal session", openObjectSchema) },
  }),
  projectRoute({
    method: "get", path: "/instances/{instanceId}/terminal-targets", operationId: "listInstanceTerminalTargets",
    summary: "List Instance terminal targets", tags: ["Instances"], request: { params: instanceParamsSchema },
    responses: { 200: response("Terminal target list", z.object({ data: domainCollectionSchema })) },
  }),
  projectRoute({
    method: "get", path: "/instances/{instanceId}/audit", operationId: "listInstanceAuditEvents",
    summary: "List Instance audit events", tags: ["Instances"], request: { params: instanceParamsSchema },
    responses: { 200: response("Instance audit events", z.object({ data: domainCollectionSchema })) },
  }),
  projectRoute({
    method: "get", path: "/audit-logs", operationId: "listAuditLogs",
    summary: "List Project audit logs", tags: ["Audit logs"], request: { query: auditQuerySchema },
    responses: { 200: response("Audit log page", openObjectSchema) },
  }),
  projectRoute({
    method: "get", path: "/audit-logs/export", operationId: "exportAuditLogs",
    summary: "Export Project audit logs", tags: ["Audit logs"], request: { query: auditQuerySchema },
    responses: { 200: response("Audit log CSV", z.string(), "text/csv") },
  }),
  projectRoute({
    method: "get", path: "/traces", operationId: "listTraces",
    summary: "List Project traces", tags: ["Traces"],
    responses: { 200: response("Trace list", traceListSchema) },
  }),
  projectRoute({
    method: "get", path: "/traces/{traceId}", operationId: "getTrace",
    summary: "Read a Project trace", tags: ["Traces"], request: { params: traceParamsSchema },
    responses: { 200: response("Trace", traceSchema) },
  }),
]);
