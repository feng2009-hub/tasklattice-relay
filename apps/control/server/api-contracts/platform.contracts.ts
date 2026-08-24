import { updatePlatformSettingsSchema } from "@tali/contracts";
import { defineContracts } from "./contract";
import { response, route } from "./helpers";
import { createProjectInputSchema, openObjectSchema, projectSummarySchema } from "./schemas";

export const platformContracts = defineContracts([
  route({
    method: "get",
    path: "/platform/settings",
    operationId: "getPlatformSettings",
    summary: "Read Platform Administrator settings",
    description: "Read platform-wide runtime and Provider admission settings.",
    tags: ["Platform administration"],
    responses: { 200: response("Platform settings", openObjectSchema) },
  }),
  route({
    method: "put",
    path: "/platform/settings",
    operationId: "updatePlatformSettings",
    summary: "Update Platform Administrator settings",
    description: "Update platform-wide runtime and Provider admission settings.",
    tags: ["Platform administration"],
    request: { body: updatePlatformSettingsSchema },
    responses: { 200: response("Updated Platform settings", openObjectSchema) },
  }),
  route({
    method: "get",
    path: "/platform/organization",
    operationId: "getPlatformOrganization",
    summary: "Read the platform organization",
    description: "List Departments, Projects, and people visible at the platform scope.",
    tags: ["Platform administration"],
    responses: { 200: response("Platform organization", openObjectSchema) },
  }),
  route({
    method: "post",
    path: "/platform/projects",
    operationId: "createPlatformProject",
    summary: "Create a Project at platform scope",
    description: "Create a Project in a Department using Platform Administrator authority.",
    tags: ["Platform administration"],
    request: { body: createProjectInputSchema },
    responses: { 201: response("Created Project", projectSummarySchema) },
  }),
]);
