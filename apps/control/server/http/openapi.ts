const json = (schema: object) => ({
  content: { "application/json": { schema } },
});

const projectIdParameter = {
  name: "projectId",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;

const instanceId = {
  name: "instanceId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const providerId = {
  name: "providerId",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;

const policyId = {
  name: "policyId",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
} as const;

const profileId = {
  name: "profileId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const virtualEmployeeId = {
  name: "virtualEmployeeId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const bindingId = {
  name: "bindingId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const scopeId = {
  name: "scopeId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const resourceKind = {
  name: "kind",
  in: "path",
  required: true,
  schema: { type: "string", enum: ["skills", "mcp-servers", "knowledge-sources"] },
} as const;

const resourceId = {
  name: "resourceId",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;

const costCommonParameters = [
  { name: "start_time", in: "query", required: true, schema: { type: "string" } },
  { name: "end_time", in: "query", required: true, schema: { type: "string" } },
  { name: "timezone", in: "query", schema: { type: "string", default: "UTC" } },
  { name: "environment_id", in: "query", schema: { type: "string" } },
  { name: "filters", in: "query", description: "JSON object whose values are arrays of business IDs.", schema: { type: "string", default: "{}" } },
] as const;

const costGroupByParameter = {
  name: "group_by",
  in: "query",
  schema: {
    type: "string",
    enum: ["instance", "model_endpoint", "provider_account", "virtual_key"],
    default: "instance",
  },
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "TaskLattice API",
    version: "0.1.0",
    description: "REST API for provisioning NemoClaw Agents and opening short-lived terminal sessions.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/config": {
      get: {
        operationId: "getAuthConfig",
        security: [],
        summary: "Read public authentication capabilities",
        responses: {
          "200": { description: "Authentication capabilities", ...json({ $ref: "#/components/schemas/AuthConfig" }) },
        },
      },
    },
    "/auth/local": {
      post: {
        operationId: "localLogin",
        security: [],
        summary: "Exchange local credentials for a TaskLattice bearer token",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/LocalLoginInput" }) },
        responses: {
          "200": { description: "Authenticated session", ...json({ $ref: "#/components/schemas/AuthSession" }) },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/me": {
      get: {
        operationId: "getCurrentUser",
        summary: "Resolve the current bearer identity",
        responses: {
          "200": { description: "Current identity", ...json({ $ref: "#/components/schemas/CurrentUser" }) },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/logout": {
      post: {
        operationId: "logout",
        summary: "Resolve optional provider logout before client token removal",
        responses: {
          "200": { description: "Logout result", ...json({ type: "object", required: ["message"], properties: { message: { type: "string" }, redirectUrl: { type: "string", format: "uri" } } }) },
        },
      },
    },
    "/profile": {
      get: {
        operationId: "getPersonalProfile",
        summary: "Read the current user's personal profile",
        responses: {
          "200": { description: "Personal profile", ...json({ $ref: "#/components/schemas/PersonalProfile" }) },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
      patch: {
        operationId: "updatePersonalProfile",
        summary: "Update personal details that are independent of a Project",
        requestBody: {
          required: true,
          ...json({
            type: "object",
            additionalProperties: false,
            required: ["city", "theme", "timezone"],
            properties: {
              city: { type: "string", maxLength: 120 },
              theme: { type: "string", enum: ["system", "light", "dark"] },
              timezone: { type: "string", maxLength: 120 },
            },
          }),
        },
        responses: {
          "200": { description: "Updated personal profile", ...json({ $ref: "#/components/schemas/PersonalProfile" }) },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/profile/password": {
      post: {
        operationId: "resetLocalPassword",
        summary: "Reset the current local account password",
        requestBody: {
          required: true,
          ...json({
            type: "object",
            additionalProperties: false,
            required: ["currentPassword", "newPassword"],
            properties: {
              currentPassword: { type: "string", maxLength: 128 },
              newPassword: { type: "string", minLength: 12, maxLength: 128 },
            },
          }),
        },
        responses: {
          "204": { description: "Password reset" },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/sso/start": {
      get: {
        operationId: "startSso",
        security: [],
        summary: "Start OIDC Authorization Code with PKCE",
        responses: {
          "302": { description: "Redirect to the configured OIDC provider" },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects": {
      get: {
        operationId: "listProjects",
        summary: "List projects available to the current user",
        responses: { "200": { description: "Project list" } },
      },
      post: {
        operationId: "createProject",
        summary: "Create a project",
        responses: { "201": { description: "Project created" } },
      },
    },
    "/projects/{projectId}": {
      parameters: [projectIdParameter],
      patch: {
        operationId: "updateProject",
        summary: "Update project settings",
        responses: { "200": { description: "Project updated" } },
      },
      delete: {
        operationId: "deleteProject",
        summary: "Delete a project",
        responses: { "204": { description: "Project deleted" } },
      },
    },
    "/projects/{projectId}/members": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listProjectMembers",
        summary: "List the human and virtual members of a Project team",
        responses: {
          "200": {
            description: "Unified Project team member list",
            ...json({
              type: "array",
              items: { $ref: "#/components/schemas/ProjectTeamMember" },
            }),
          },
        },
      },
    },
    "/projects/{projectId}/members/invitations": {
      parameters: [projectIdParameter],
      post: {
        operationId: "inviteProjectMember",
        summary: "Invite a human Project member",
        responses: {
          "201": {
            description: "Invitation created",
            ...json({ $ref: "#/components/schemas/HumanProjectMember" }),
          },
        },
      },
    },
    "/projects/{projectId}/catalog": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getResourceCatalog",
        summary: "Read the PostgreSQL-backed resource and Agent Role catalog",
        responses: {
          "200": { description: "Resource catalog", ...json({ $ref: "#/components/schemas/ResourceCatalog" }) },
        },
      },
    },
    "/projects/{projectId}/catalog/{kind}": {
      parameters: [projectIdParameter, resourceKind],
      post: {
        operationId: "createResource",
        summary: "Create a Skill, MCP server, or Knowledge source",
        requestBody: { required: true, ...json({ oneOf: [
          { $ref: "#/components/schemas/SkillDefinitionInput" },
          { $ref: "#/components/schemas/McpServerDefinitionInput" },
          { $ref: "#/components/schemas/KnowledgeSourceDefinitionInput" },
        ] }) },
        responses: {
          "201": { description: "Created resource", ...json({ type: "object" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/catalog/{kind}/{resourceId}": {
      parameters: [projectIdParameter, resourceKind, resourceId],
      put: {
        operationId: "updateResource",
        summary: "Update a persisted resource definition",
        requestBody: { required: true, ...json({ type: "object" }) },
        responses: {
          "200": { description: "Updated resource", ...json({ type: "object" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
      delete: {
        operationId: "deleteResource",
        summary: "Delete a resource that is not assigned to a Role or Instance",
        responses: {
          "200": { description: "Resource deleted", ...json({ type: "object", required: ["message"], properties: { message: { type: "string" } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/catalog/mcp-servers/{resourceId}/discover": {
      parameters: [projectIdParameter, resourceId],
      post: {
        operationId: "discoverMcpServerTools",
        summary: "Connect to an MCP server, run tools/list, and persist the discovered tools",
        responses: {
          "200": {
            description: "Updated MCP server discovery snapshot",
            ...json({ $ref: "#/components/schemas/McpServerDefinition" }),
          },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/providers": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listProviderAccounts",
        summary: "List validated Endpoint and credential accounts",
        responses: {
          "200": { description: "Provider Account collection", ...json({ $ref: "#/components/schemas/ProviderAccountCollection" }) },
        },
      },
      post: {
        operationId: "registerProviderAccount",
        summary: "Register a Provider connection and selected LiteLLM models",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/CreateProviderConnectionInput" }) },
        responses: {
          "201": { description: "Provider connection creation result", ...json({ $ref: "#/components/schemas/ProviderConnectionCreationResult" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/providers/discover": {
      parameters: [projectIdParameter],
      post: {
        operationId: "discoverProviderModels",
        summary: "Validate a Provider draft and discover models without persisting credentials",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/ProviderConnectionDraft" }) },
        responses: {
          "200": { description: "Provider discovery result", ...json({ $ref: "#/components/schemas/ProviderDiscoveryResult" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/providers/{providerId}/validate": {
      parameters: [projectIdParameter, providerId],
      post: {
        operationId: "revalidateProviderAccount",
        summary: "Re-run Endpoint, credential, and catalog validation",
        responses: {
          "200": { description: "Updated validation result", ...json({ $ref: "#/components/schemas/ProviderAccount" }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/providers/{providerId}": {
      parameters: [projectIdParameter, providerId],
      delete: {
        operationId: "deleteProviderAccount",
        summary: "Delete an unused Provider Account and its LiteLLM models",
        responses: {
          "200": { description: "Provider Account deleted", ...json({ type: "object", required: ["message"], properties: { message: { type: "string" } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/models": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listModelDeployments",
        summary: "List categorized model deployments",
        responses: { "200": { description: "Model deployment collection", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/ModelDeployment" } } } }) } },
      },
      post: {
        operationId: "registerModelDeployment",
        summary: "Validate a typed model and register it in LiteLLM",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/CreateModelDeploymentInput" }) },
        responses: { "201": { description: "Model validation result", ...json({ $ref: "#/components/schemas/ModelDeployment" }) } },
      },
    },
    "/projects/{projectId}/models/{modelId}/default": {
      parameters: [projectIdParameter, { name: "modelId", in: "path", required: true, schema: { type: "string" } }],
      post: {
        operationId: "markModelDeploymentAsDefault",
        summary: "Mark one validated LLM deployment as the global default",
        responses: {
          "200": { description: "Default model deployment", ...json({ $ref: "#/components/schemas/ModelDeployment" }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/inference-gateways": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listInferenceGateways",
        summary: "List configured LiteLLM Gateways without credentials",
        responses: { "200": { description: "Inference Gateway collection", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/InferenceGateway" } } } }) } },
      },
    },
    "/projects/{projectId}/quota": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getProjectQuota",
        summary: "Read Project quota configuration, synchronization state, and usage",
        responses: {
          "200": { description: "Project quota", ...json({ $ref: "#/components/schemas/ProjectQuota" }) },
        },
      },
      put: {
        operationId: "updateProjectQuota",
        summary: "Update TALI capacity and synchronize spend plus TPM limits to the LiteLLM Team",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/UpdateProjectQuotaInput" }) },
        responses: {
          "200": { description: "Updated Project quota", ...json({ $ref: "#/components/schemas/ProjectQuota" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/model-profiles": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listModelProfiles",
        summary: "List LiteLLM-managed inference access contracts",
        responses: { "200": { description: "Model Profile collection", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/ModelProfile" } } } }) } },
      },
      post: {
        operationId: "createModelProfile",
        summary: "Create and validate a Model Profile binding",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/CreateModelProfileInput" }) },
        responses: { "201": { description: "Model Profile", ...json({ $ref: "#/components/schemas/ModelProfile" }) }, "400": { $ref: "#/components/responses/Error" } },
      },
    },
    "/projects/{projectId}/model-profiles/{profileId}": {
      parameters: [projectIdParameter, profileId],
      get: { operationId: "getModelProfile", summary: "Read a Model Profile", responses: { "200": { description: "Model Profile", ...json({ $ref: "#/components/schemas/ModelProfile" }) }, "404": { $ref: "#/components/responses/Error" } } },
      put: { operationId: "updateModelProfile", summary: "Update TaskLattice-owned Model Profile policy", requestBody: { required: true, ...json({ type: "object", additionalProperties: false, properties: { name: { type: "string" }, description: { type: "string" }, isDefault: { type: "boolean" }, keyPolicy: { type: "object" }, auditPolicy: { type: "object" }, suspended: { type: "boolean" } } }) }, responses: { "200": { description: "Model Profile", ...json({ $ref: "#/components/schemas/ModelProfile" }) } } },
      delete: { operationId: "deleteModelProfile", summary: "Delete a Model Profile without active Consumers", responses: { "200": { description: "Model Profile deleted", ...json({ type: "object" }) }, "409": { $ref: "#/components/responses/Error" } } },
    },
    "/projects/{projectId}/model-profiles/{profileId}/refresh": {
      parameters: [projectIdParameter, profileId],
      post: { operationId: "refreshModelProfile", summary: "Synchronize effective LiteLLM capability and compliance status", responses: { "200": { description: "Synchronized Model Profile", ...json({ $ref: "#/components/schemas/ModelProfile" }) } } },
    },
    "/projects/{projectId}/model-profiles/{profileId}/consumers": {
      parameters: [projectIdParameter, profileId],
      get: { operationId: "listModelProfileConsumers", summary: "List redacted active Instance bindings", responses: { "200": { description: "Redacted Consumers", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/ModelProfileConsumer" } } } }) } } },
    },
    "/projects/{projectId}/model-profiles/{profileId}/audit": {
      parameters: [projectIdParameter, profileId],
      get: { operationId: "listModelProfileAudit", summary: "List secret-safe control-plane audit events", responses: { "200": { description: "Audit events", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/ModelProfileAuditEvent" } } } }) } } },
    },
    "/projects/{projectId}/costs/summary": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostSummary",
        summary: "Read USD spend, token, request, and prior-period summary",
        parameters: costCommonParameters,
        responses: { "200": { description: "Cost summary", ...json({ $ref: "#/components/schemas/ModelCostSummary" }) } },
      },
    },
    "/projects/{projectId}/costs/activity": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostActivity",
        summary: "Read zero-filled spend activity in the requested timezone",
        parameters: [
          ...costCommonParameters,
          costGroupByParameter,
          { name: "granularity", in: "query", schema: { type: "string", enum: ["daily", "weekly", "cumulative"], default: "daily" } },
        ],
        responses: { "200": { description: "Cost activity", ...json({ $ref: "#/components/schemas/ModelCostActivity" }) } },
      },
    },
    "/projects/{projectId}/costs/insights": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostInsights",
        summary: "Read derived cost insights",
        parameters: costCommonParameters,
        responses: { "200": { description: "Cost insights", ...json({ type: "object" }) } },
      },
    },
    "/projects/{projectId}/costs/ranking": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostRanking",
        summary: "Rank business objects by total USD spend",
        parameters: [
          ...costCommonParameters,
          costGroupByParameter,
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 5 } },
        ],
        responses: { "200": { description: "Cost ranking", ...json({ $ref: "#/components/schemas/ModelCostRanking" }) } },
      },
    },
    "/projects/{projectId}/costs/trend": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostTrend",
        summary: "Read stable Top N cost series plus Others",
        parameters: [
          ...costCommonParameters,
          costGroupByParameter,
          { name: "granularity", in: "query", schema: { type: "string", enum: ["day", "week", "month"], default: "day" } },
          { name: "top_n", in: "query", schema: { type: "integer", minimum: 1, maximum: 20, default: 5 } },
        ],
        responses: { "200": { description: "Cost trend", ...json({ $ref: "#/components/schemas/ModelCostTrend" }) } },
      },
    },
    "/projects/{projectId}/costs/breakdown": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostBreakdown",
        summary: "Search, sort, and paginate a dimensional cost breakdown",
        parameters: [
          ...costCommonParameters,
          costGroupByParameter,
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 25 } },
          { name: "sort", in: "query", schema: { type: "string", default: "spend_usd" } },
          { name: "direction", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Cost breakdown", ...json({ $ref: "#/components/schemas/ModelCostBreakdown" }) } },
      },
    },
    "/projects/{projectId}/costs/data-quality": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getCostDataQuality",
        summary: "Read internal ingestion and attribution quality diagnostics",
        parameters: costCommonParameters,
        responses: { "200": { description: "Cost data quality", ...json({ type: "object" }) } },
      },
    },
    "/projects/{projectId}/policies": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listSandboxPolicies",
        summary: "List ConfigMap-managed and custom OpenShell Policies",
        responses: { "200": { description: "Policy catalog", ...json({ $ref: "#/components/schemas/SandboxPolicyCatalog" }) } },
      },
      post: {
        operationId: "createSandboxPolicy",
        summary: "Create a custom OpenShell Policy",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/SandboxPolicyInput" }) },
        responses: {
          "201": { description: "Custom Policy", ...json({ $ref: "#/components/schemas/SandboxPolicy" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/policies/{policyId}": {
      parameters: [projectIdParameter, policyId],
      put: {
        operationId: "updateSandboxPolicy",
        summary: "Update a custom OpenShell Policy",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/SandboxPolicyInput" }) },
        responses: {
          "200": { description: "Updated custom Policy", ...json({ $ref: "#/components/schemas/SandboxPolicy" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
      delete: {
        operationId: "deleteSandboxPolicy",
        summary: "Delete an unused custom OpenShell Policy",
        responses: {
          "200": { description: "Policy deleted", ...json({ type: "object", required: ["message"], properties: { message: { type: "string" } } }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/runtime": {
      parameters: [projectIdParameter],
      get: {
        operationId: "getRuntimeStatus",
        summary: "Read NemoClaw TUI runtime capability",
        responses: {
          "200": { description: "Runtime capability", ...json({ $ref: "#/components/schemas/RuntimeStatus" }) },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/virtual-employees": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listVirtualEmployees",
        summary: "List project-scoped Virtual Employees",
        responses: {
          "200": { description: "Virtual Employee collection", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/VirtualEmployee" } } } }) },
        },
      },
      post: {
        operationId: "createVirtualEmployee",
        summary: "Create a Virtual Employee and optionally provision its LiteLLM Service Account Key",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/CreateVirtualEmployeeInput" }) },
        responses: {
          "201": { description: "Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) },
          "400": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}": {
      parameters: [projectIdParameter, virtualEmployeeId],
      get: {
        operationId: "getVirtualEmployee",
        summary: "Read a Virtual Employee with model, identity, scope, and Instance bindings",
        responses: { "200": { description: "Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) }, "404": { $ref: "#/components/responses/Error" } },
      },
      patch: {
        operationId: "updateVirtualEmployee",
        summary: "Update Virtual Employee desired configuration",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/UpdateVirtualEmployeeInput" }) },
        responses: { "200": { description: "Updated Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } },
      },
      delete: {
        operationId: "deleteVirtualEmployee",
        summary: "Delete an unbound Virtual Employee and revoke its model credential",
        responses: { "204": { description: "Deleted" }, "409": { $ref: "#/components/responses/Error" } },
      },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/provision": {
      parameters: [projectIdParameter, virtualEmployeeId],
      post: { operationId: "provisionVirtualEmployee", summary: "Provision LiteLLM model access and store the credential in the Secret Store", responses: { "200": { description: "Active Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/suspend": {
      parameters: [projectIdParameter, virtualEmployeeId],
      post: { operationId: "suspendVirtualEmployee", summary: "Suspend the Virtual Employee and block its LiteLLM key", responses: { "200": { description: "Suspended Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/activate": {
      parameters: [projectIdParameter, virtualEmployeeId],
      post: { operationId: "activateVirtualEmployee", summary: "Activate the Virtual Employee and enable its LiteLLM key", responses: { "200": { description: "Active Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/rotate-model-credential": {
      parameters: [projectIdParameter, virtualEmployeeId],
      post: { operationId: "rotateVirtualEmployeeCredential", summary: "Rotate the LiteLLM credential without exposing its value", responses: { "200": { description: "Virtual Employee with rotated credential metadata", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/sync": {
      parameters: [projectIdParameter, virtualEmployeeId],
      post: {
        operationId: "syncVirtualEmployee",
        summary: "Detect LiteLLM drift or explicitly apply TALI desired configuration",
        requestBody: { ...json({ type: "object", additionalProperties: false, properties: { apply: { type: "boolean", default: false } } }) },
        responses: { "200": { description: "Synchronized Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } },
      },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/identities": {
      parameters: [projectIdParameter, virtualEmployeeId],
      get: { operationId: "listVirtualEmployeeIdentities", summary: "List backing system identity references", responses: { "200": { description: "Identity bindings", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/IdentityBinding" } } } }) } } },
      post: { operationId: "attachVirtualEmployeeIdentity", summary: "Attach a non-secret external identity reference", requestBody: { required: true, ...json({ $ref: "#/components/schemas/IdentityBindingInput" }) }, responses: { "200": { description: "Updated Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/identities/{bindingId}": {
      parameters: [projectIdParameter, virtualEmployeeId, bindingId],
      delete: { operationId: "detachVirtualEmployeeIdentity", summary: "Detach a system identity reference", responses: { "204": { description: "Detached" } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/access-scopes": {
      parameters: [projectIdParameter, virtualEmployeeId],
      get: { operationId: "listVirtualEmployeeAccessScopes", summary: "List declared external-system access scopes and enforcement status", responses: { "200": { description: "Access scope bindings", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/AccessScopeBinding" } } } }) } } },
      post: { operationId: "attachVirtualEmployeeAccessScope", summary: "Attach a declared access scope", requestBody: { required: true, ...json({ $ref: "#/components/schemas/AccessScopeBindingInput" }) }, responses: { "200": { description: "Updated Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/access-scopes/{scopeId}": {
      parameters: [projectIdParameter, virtualEmployeeId, scopeId],
      patch: { operationId: "updateVirtualEmployeeAccessScope", summary: "Update an access scope and enforcement status", requestBody: { required: true, ...json({ $ref: "#/components/schemas/AccessScopeBindingInput" }) }, responses: { "200": { description: "Updated Virtual Employee", ...json({ $ref: "#/components/schemas/VirtualEmployee" }) } } },
      delete: { operationId: "detachVirtualEmployeeAccessScope", summary: "Detach an access scope", responses: { "204": { description: "Detached" } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/spend": {
      parameters: [projectIdParameter, virtualEmployeeId],
      get: { operationId: "getVirtualEmployeeSpend", summary: "Read 30-day LiteLLM spend attributed to the Virtual Employee key", responses: { "200": { description: "Spend summary", ...json({ $ref: "#/components/schemas/VirtualEmployeeSpend" }) } } },
    },
    "/projects/{projectId}/virtual-employees/{virtualEmployeeId}/audit-events": {
      parameters: [projectIdParameter, virtualEmployeeId],
      get: { operationId: "listVirtualEmployeeAuditEvents", summary: "List Virtual Employee lifecycle and binding events", responses: { "200": { description: "Audit events", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/VirtualEmployeeAuditEvent" } } } }) } } },
    },
    "/projects/{projectId}/instances": {
      parameters: [projectIdParameter],
      get: {
        operationId: "listAgents",
        summary: "List Agents",
        responses: {
          "200": { description: "Agent collection", ...json({ $ref: "#/components/schemas/AgentCollection" }) },
        },
      },
      post: {
        operationId: "createAgent",
        summary: "Create a NemoClaw Agent",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/CreateAgentInput" }) },
        responses: {
          "202": { description: "Provisioning accepted", headers: { Location: { schema: { type: "string" } } }, ...json({ $ref: "#/components/schemas/Agent" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/instances/{instanceId}": {
      parameters: [projectIdParameter, instanceId],
      get: {
        operationId: "getAgent",
        summary: "Read an Agent and reconcile its runtime state",
        responses: {
          "200": { description: "Agent", ...json({ $ref: "#/components/schemas/Agent" }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
      delete: {
        operationId: "deleteAgent",
        summary: "Destroy an Agent and its NemoClaw sandbox",
        responses: {
          "202": { description: "Sandbox destroyed and resource removed", ...json({ $ref: "#/components/schemas/DeleteAgentResult" }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/instances/{instanceId}/virtual-employee": {
      parameters: [projectIdParameter, instanceId],
      put: {
        operationId: "bindAgentVirtualEmployee",
        summary: "Switch an Instance to an Active Virtual Employee and recreate its runtime",
        requestBody: { required: true, ...json({ type: "object", additionalProperties: false, required: ["virtualEmployeeId"], properties: { virtualEmployeeId: { type: "string", format: "uuid" } } }) },
        responses: { "200": { description: "Updated Agent", ...json({ $ref: "#/components/schemas/Agent" }) }, "409": { $ref: "#/components/responses/Error" } },
      },
      delete: {
        operationId: "unbindAgentVirtualEmployee",
        summary: "Stop an Instance runtime and remove its Virtual Employee binding",
        responses: { "200": { description: "Stopped Agent", ...json({ $ref: "#/components/schemas/Agent" }) } },
      },
    },
    "/projects/{projectId}/instances/{instanceId}/terminal-sessions": {
      parameters: [projectIdParameter, instanceId],
      post: {
        operationId: "createTerminalSession",
        summary: "Create a short-lived, single-use terminal session",
        requestBody: { required: true, ...json({ $ref: "#/components/schemas/CreateTerminalSessionInput" }) },
        responses: {
          "201": { description: "Terminal session", ...json({ $ref: "#/components/schemas/TerminalSession" }) },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/instances/{instanceId}/terminal-targets": {
      parameters: [projectIdParameter, instanceId],
      get: {
        operationId: "getTerminalTargets",
        summary: "List interactive terminal targets for a running Agent",
        responses: {
          "200": { description: "Terminal targets", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/TerminalTarget" } } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/projects/{projectId}/instances/{instanceId}/audit": {
      parameters: [projectIdParameter, instanceId],
      get: {
        operationId: "getAgentAudit",
        summary: "Read recent OpenShell OCSF audit events for an Agent sandbox",
        responses: {
          "200": { description: "Sandbox audit events", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/SandboxAuditEvent" } } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      AuthConfig: {
        type: "object",
        required: ["authRequired", "developmentDefaults", "localEnabled", "mode", "providerName", "ssoEnabled"],
        properties: {
          authRequired: { type: "boolean", const: true },
          developmentDefaults: { type: "boolean" },
          localEnabled: { type: "boolean" },
          mode: { type: "string", enum: ["local", "local-sso"] },
          providerName: { type: "string" },
          ssoEnabled: { type: "boolean" },
        },
      },
      AuthUser: {
        type: "object",
        required: ["displayName", "email", "id", "provider", "systemRole", "username"],
        properties: {
          displayName: { type: "string" },
          email: { type: "string" },
          id: { type: "string" },
          provider: { type: "string", enum: ["local", "sso"] },
          systemRole: { type: "string", enum: ["user", "super_administrator"] },
          username: { type: "string" },
        },
      },
      LocalLoginInput: {
        type: "object",
        additionalProperties: false,
        required: ["password", "username"],
        properties: {
          password: { type: "string" },
          remember: { type: "boolean", default: false },
          username: { type: "string" },
        },
      },
      AuthSession: {
        type: "object",
        required: ["expiresAt", "token", "user"],
        properties: {
          expiresAt: { type: "string", format: "date-time" },
          token: { type: "string" },
          user: { $ref: "#/components/schemas/AuthUser" },
        },
      },
      CurrentUser: {
        type: "object",
        required: ["identity", "user"],
        properties: {
          identity: { type: "object", required: ["type", "userId", "username"], properties: { type: { type: "string", const: "authenticated" }, userId: { type: "string" }, username: { type: "string" } } },
          user: { $ref: "#/components/schemas/AuthUser" },
        },
      },
      PersonalProfile: {
        type: "object",
        additionalProperties: false,
        required: ["city", "displayName", "email", "provider", "systemRole", "theme", "timezone", "username"],
        properties: {
          city: { type: "string" },
          displayName: { type: "string" },
          email: { type: "string" },
          provider: { type: "string", enum: ["local", "sso"] },
          systemRole: { type: "string", enum: ["user", "super_administrator"] },
          theme: { type: "string", enum: ["system", "light", "dark"] },
          timezone: { type: "string" },
          username: { type: "string" },
        },
      },
      HumanProjectMember: {
        type: "object",
        additionalProperties: false,
        required: ["email", "id", "kind", "name", "role", "status"],
        properties: {
          email: { type: "string", format: "email" },
          id: { type: "string" },
          kind: { type: "string", const: "human" },
          name: { type: "string" },
          role: { type: "string", enum: ["admin", "member"] },
          status: { type: "string", enum: ["active", "invited"] },
        },
      },
      VirtualProjectMember: {
        type: "object",
        additionalProperties: false,
        required: [
          "environment",
          "id",
          "kind",
          "name",
          "role",
          "status",
        ],
        properties: {
          businessRole: { type: "string" },
          environment: {
            type: "string",
            enum: ["development", "uat", "production"],
          },
          id: { type: "string" },
          kind: { type: "string", const: "virtual" },
          name: { type: "string" },
          role: { type: "string", const: "virtual_employee" },
          status: {
            type: "string",
            enum: [
              "active",
              "draft",
              "pending_approval",
              "provisioning",
              "suspended",
              "expired",
              "error",
            ],
          },
        },
      },
      ProjectTeamMember: {
        oneOf: [
          { $ref: "#/components/schemas/HumanProjectMember" },
          { $ref: "#/components/schemas/VirtualProjectMember" },
        ],
        discriminator: {
          propertyName: "kind",
          mapping: {
            human: "#/components/schemas/HumanProjectMember",
            virtual: "#/components/schemas/VirtualProjectMember",
          },
        },
      },
      SkillDefinitionInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "category", "version", "endpoint", "digest", "owner", "permissions", "status"],
        properties: {
          name: { type: "string" }, description: { type: "string" },
          category: { type: "string", enum: ["Customer Support", "Data", "Developer Tools", "HR", "Knowledge", "Operations", "Research"] },
          version: { type: "string" }, endpoint: { type: "string", format: "uri" }, digest: { type: "string" }, owner: { type: "string" },
          permissions: { type: "integer", minimum: 0 }, status: { type: "string", enum: ["PUBLISHED", "DRAFT"] },
        },
      },
      SkillDefinition: {
        allOf: [
          { $ref: "#/components/schemas/SkillDefinitionInput" },
          { type: "object", required: ["id", "bindings"], properties: { id: { type: "string" }, bindings: { type: "integer", minimum: 0 } } },
        ],
      },
      McpServerDefinitionInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "alias", "description", "category", "transport", "args", "environment", "authType", "authReference", "accessGroups", "allowedTools", "extraHeaders", "staticHeaders", "internalNetworkOnly"],
        properties: {
          templateId: { type: "string" },
          name: { type: "string" },
          alias: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          logoUrl: { type: "string", format: "uri" },
          sourceUrl: { type: "string", format: "uri" },
          endpoint: { type: "string", format: "uri" },
          specPath: { type: "string" },
          transport: { type: "string", enum: ["http", "sse", "stdio", "openapi"] },
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } },
          environment: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "valueReference"],
              properties: { name: { type: "string" }, valueReference: { type: "string" } },
            },
          },
          authType: { type: "string", enum: ["none", "bearer_token", "api_key", "basic", "authorization", "oauth2", "aws_sigv4"] },
          authReference: { type: "string", description: "Secret reference; never a plaintext credential." },
          oauth: {
            type: "object",
            properties: {
              flow: { type: "string", enum: ["client_credentials", "authorization_code"] },
              authorizationUrl: { type: "string", format: "uri" },
              tokenUrl: { type: "string", format: "uri" },
              registrationUrl: { type: "string", format: "uri" },
            },
          },
          accessGroups: { type: "array", items: { type: "string" } },
          allowedTools: { type: "array", items: { type: "string" } },
          extraHeaders: { type: "array", items: { type: "string" } },
          staticHeaders: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "valueReference"],
              properties: { name: { type: "string" }, valueReference: { type: "string" } },
            },
          },
          internalNetworkOnly: { type: "boolean" },
        },
      },
      McpToolDefinition: {
        type: "object",
        additionalProperties: false,
        required: ["name", "inputSchema", "discoveredAt"],
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          inputSchema: { type: "object", additionalProperties: true },
          outputSchema: { type: "object", additionalProperties: true },
          annotations: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              readOnlyHint: { type: "boolean" },
              destructiveHint: { type: "boolean" },
              idempotentHint: { type: "boolean" },
              openWorldHint: { type: "boolean" },
            },
          },
          discoveredAt: { type: "string", format: "date-time" },
        },
      },
      McpServerDefinition: {
        allOf: [
          { $ref: "#/components/schemas/McpServerDefinitionInput" },
          {
            type: "object",
            required: ["id", "litellmServerId", "status", "tools", "lastDiscoveryAttemptAt", "lastDiscoveredAt", "lastDiscoveryError"],
            properties: {
              id: { type: "string" },
              litellmServerId: { type: "string" },
              status: { type: "string", enum: ["HEALTHY", "PERMISSION_REQUIRED", "UNCHECKED", "UNAVAILABLE"] },
              tools: { type: "array", items: { $ref: "#/components/schemas/McpToolDefinition" } },
              lastDiscoveryAttemptAt: { type: ["string", "null"], format: "date-time" },
              lastDiscoveredAt: { type: ["string", "null"], format: "date-time" },
              lastDiscoveryError: { type: ["string", "null"] },
            },
          },
        ],
      },
      KnowledgeSourceDefinitionInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "vectorStoreId", "provider", "credentialReference", "topK"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          vectorStoreId: { type: "string" },
          provider: { type: "string", enum: ["openai", "azure", "bedrock", "vertex_ai", "pg_vector", "elasticsearch"] },
          apiBase: { type: "string", format: "uri" },
          embeddingModel: { type: "string" },
          semanticField: { type: "string", description: "Elasticsearch semantic_text field used for vector search." },
          contentField: { type: "string", description: "Elasticsearch source field returned as result content." },
          credentialReference: { type: "string", description: "Secret reference; never a plaintext credential." },
          topK: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
      KnowledgeSourceDefinition: {
        allOf: [
          { $ref: "#/components/schemas/KnowledgeSourceDefinitionInput" },
          {
            type: "object",
            required: ["id", "status", "lastReconciliationError"],
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["REGISTERED", "UNAVAILABLE"] },
              lastReconciliationError: { type: ["string", "null"] },
            },
          },
        ],
      },
      AgentSpecializationDefinition: {
        type: "object",
        required: ["id", "name", "roleLabel", "description", "icon", "systemPrompt", "defaultSkillIds", "defaultMcpServerIds", "defaultKnowledgeSourceIds"],
        properties: {
          id: { type: "string" }, name: { type: "string" }, roleLabel: { type: "string" }, description: { type: "string" },
          icon: { type: "string", enum: ["briefcase", "headphones", "settings", "sparkles", "telescope", "users"] }, systemPrompt: { type: "string" },
          defaultSkillIds: { type: "array", items: { type: "string" } }, defaultMcpServerIds: { type: "array", items: { type: "string" } }, defaultKnowledgeSourceIds: { type: "array", items: { type: "string" } },
        },
      },
      ResourceCatalog: {
        type: "object",
        required: ["skills", "mcpServers", "mcpServerTemplates", "knowledgeSources", "specializations"],
        properties: {
          skills: { type: "array", items: { $ref: "#/components/schemas/SkillDefinition" } },
          mcpServers: { type: "array", items: { $ref: "#/components/schemas/McpServerDefinition" } },
          mcpServerTemplates: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "description", "category", "logo", "sourceUrl", "transport", "args", "defaultAuthType"],
              properties: {
                id: { type: "string" }, name: { type: "string" }, description: { type: "string" },
                category: { type: "string" }, logo: { type: "string" }, sourceUrl: { type: "string", format: "uri" },
                transport: { type: "string", enum: ["http", "sse", "stdio", "openapi"] },
                endpointPlaceholder: { type: "string" }, command: { type: "string" },
                args: { type: "array", items: { type: "string" } },
                defaultAuthType: { type: "string" },
              },
            },
          },
          knowledgeSources: { type: "array", items: { $ref: "#/components/schemas/KnowledgeSourceDefinition" } },
          specializations: { type: "array", items: { $ref: "#/components/schemas/AgentSpecializationDefinition" } },
        },
      },
      VirtualEmployeeModelAccessInput: {
        type: "object",
        additionalProperties: false,
        required: ["allowedModels"],
        properties: {
          litellmTeamId: { type: "string" },
          allowedModels: { type: "array", minItems: 1, items: { type: "string" } },
          accessGroups: { type: "array", default: [], items: { type: "string" } },
          maxBudget: { type: "number", minimum: 0 },
          budgetDuration: { type: "string", default: "30d" },
          rpmLimit: { type: "integer", minimum: 1 },
          tpmLimit: { type: "integer", minimum: 1 },
          maxParallelRequests: { type: "integer", minimum: 1 },
          keyDuration: { type: "string", pattern: "^\\d+(?:s|m|h|d|w)$", default: "90d" },
          fallbackModels: { type: "array", default: [], items: { type: "string" } },
        },
      },
      IdentityBindingInput: {
        type: "object",
        additionalProperties: false,
        required: ["identityType", "provider", "externalReference", "displayName"],
        properties: {
          identityType: { type: "string", enum: ["kubernetes_service_account", "functional_id", "oauth_client", "api_credential", "cloud_role", "custom"] },
          provider: { type: "string" },
          externalReference: { type: "string", description: "A non-secret reference. Credential values are not accepted." },
          displayName: { type: "string" },
          system: { type: "string" },
          metadata: { type: "object", additionalProperties: true, default: {} },
        },
      },
      IdentityBinding: {
        allOf: [
          { $ref: "#/components/schemas/IdentityBindingInput" },
          { type: "object", required: ["id", "virtualEmployeeId", "status", "createdAt", "updatedAt"], properties: {
            id: { type: "string", format: "uuid" },
            virtualEmployeeId: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["active", "inactive", "error"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          } },
        ],
      },
      AccessScopeBindingInput: {
        type: "object",
        additionalProperties: false,
        required: ["resourceType", "resourceId", "actions", "enforcementProvider"],
        properties: {
          resourceType: { type: "string" },
          resourceId: { type: "string" },
          actions: { type: "array", minItems: 1, items: { type: "string" } },
          conditions: { type: "object", additionalProperties: true, default: {} },
          enforcementProvider: { type: "string", enum: ["litellm", "kubernetes_rbac", "target_system", "adapter", "metadata_only"] },
          approvalStatus: { type: "string", enum: ["not_required", "pending", "approved", "rejected"], default: "not_required" },
        },
      },
      AccessScopeBinding: {
        allOf: [
          { $ref: "#/components/schemas/AccessScopeBindingInput" },
          { type: "object", required: ["id", "virtualEmployeeId", "createdAt", "updatedAt"], properties: {
            id: { type: "string", format: "uuid" },
            virtualEmployeeId: { type: "string", format: "uuid" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          } },
        ],
      },
      CreateVirtualEmployeeInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "displayName", "environment"],
        properties: {
          name: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          displayName: { type: "string", minLength: 2, maxLength: 160 },
          description: { type: "string", maxLength: 500, default: "" },
          businessRole: { type: "string" },
          ownerTeamId: { type: "string" },
          environment: { type: "string", enum: ["development", "uat", "production"] },
          tags: { type: "array", default: [], items: { type: "string" } },
          modelAccess: { $ref: "#/components/schemas/VirtualEmployeeModelAccessInput" },
          identities: { type: "array", default: [], items: { $ref: "#/components/schemas/IdentityBindingInput" } },
          accessScopes: { type: "array", default: [], items: { $ref: "#/components/schemas/AccessScopeBindingInput" } },
          activate: { type: "boolean", default: false },
        },
      },
      UpdateVirtualEmployeeInput: {
        type: "object",
        additionalProperties: false,
        description: "All properties are optional; identity and access-scope bindings use dedicated endpoints.",
        properties: {
          name: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          displayName: { type: "string", minLength: 2, maxLength: 160 },
          description: { type: "string", maxLength: 500 },
          businessRole: { type: "string" },
          ownerTeamId: { type: "string" },
          environment: { type: "string", enum: ["development", "uat", "production"] },
          tags: { type: "array", items: { type: "string" } },
          modelAccess: { $ref: "#/components/schemas/VirtualEmployeeModelAccessInput" },
        },
      },
      VirtualEmployee: {
        allOf: [
          { $ref: "#/components/schemas/CreateVirtualEmployeeInput" },
          { type: "object", required: ["id", "projectId", "status", "createdBy", "createdAt", "updatedAt", "identities", "accessScopes", "boundInstanceIds"], properties: {
            id: { type: "string", format: "uuid" },
            projectId: { type: "string" },
            status: { type: "string", enum: ["draft", "pending_approval", "provisioning", "active", "suspended", "expired", "error"] },
            createdBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            modelAccess: { type: "object", description: "Safe LiteLLM identifiers, limits, synchronization state, and last-four fingerprint. Never contains a credential or Secret Store reference." },
            identities: { type: "array", items: { $ref: "#/components/schemas/IdentityBinding" } },
            accessScopes: { type: "array", items: { $ref: "#/components/schemas/AccessScopeBinding" } },
            boundInstanceIds: { type: "array", items: { type: "string", format: "uuid" } },
          } },
        ],
      },
      VirtualEmployeeSpend: {
        type: "object",
        required: ["totalSpend", "requests", "tokens", "byModel", "daily"],
        properties: {
          totalSpend: { type: "number" },
          requests: { type: "integer" },
          tokens: { type: "integer" },
          budgetUtilization: { type: "number" },
          byModel: { type: "array", items: { type: "object", required: ["model", "spend", "requests", "tokens"], properties: { model: { type: "string" }, spend: { type: "number" }, requests: { type: "integer" }, tokens: { type: "integer" } } } },
          daily: { type: "array", items: { type: "object", required: ["date", "spend"], properties: { date: { type: "string", format: "date" }, spend: { type: "number" } } } },
        },
      },
      VirtualEmployeeAuditEvent: {
        type: "object",
        required: ["id", "virtualEmployeeId", "type", "actor", "result", "message", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          virtualEmployeeId: { type: "string", format: "uuid" },
          type: { type: "string" },
          actor: { type: "string" },
          result: { type: "string", enum: ["success", "failed"] },
          message: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateAgentInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "runtime", "agentPlatform", "virtualEmployeeId", "systemPrompt"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 64 },
          description: { type: "string", maxLength: 300, default: "" },
          runtime: { type: "string", const: "openshell" },
          agentPlatform: {
            type: "string",
            enum: ["openclaw", "hermes"],
            default: "openclaw",
            description:
              "Agent implementation configured by NemoClaw inside the OpenShell runtime.",
          },
          virtualEmployeeId: { type: "string", format: "uuid", description: "Active business identity that owns model and system access for this Instance." },
          policyId: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", description: "Catalog Policy ID. Omit to use the deployment ConfigMap default." },
          systemPrompt: { type: "string", minLength: 10, maxLength: 8000 },
          specializationId: { type: "string", minLength: 1, maxLength: 64 },
          skillIds: { type: "array", maxItems: 64, items: { type: "string" } },
          mcpServerIds: { type: "array", maxItems: 64, items: { type: "string" } },
          knowledgeSourceIds: { type: "array", maxItems: 64, items: { type: "string" } },
        },
      },
      Agent: {
        allOf: [
          { $ref: "#/components/schemas/CreateAgentInput" },
          {
            type: "object",
            required: ["schemaVersion", "id", "policyId", "providerAccountId", "providerName", "model", "modelType", "costKeyAlias", "sandboxName", "status", "createdAt", "updatedAt", "logs", "inferenceMode", "modelProfileId", "modelProfileBindingId", "modelProfileStatus", "modelProfileComplianceDomain", "modelProfileKeyFingerprint"],
            properties: {
              schemaVersion: { type: "integer", const: 1 },
              id: { type: "string", format: "uuid" },
              policyId: { type: "string" },
              providerAccountId: { type: "string" },
              providerName: { type: "string" },
              model: { type: "string" },
              modelType: { type: "string", const: "llm" },
              costKeyAlias: { type: "string" },
              sandboxName: { type: "string" },
              status: { type: "string", enum: ["PROVISIONING", "READY", "FAILED", "DESTROYING"] },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
              operationId: { type: "string" },
              runtimePhase: { type: "string" },
              provisioningStage: { type: "string", enum: ["QUEUED", "PROVIDER", "SANDBOX", "POD", "RUNTIME", "ENDPOINT", "READY"] },
              logs: { type: "array", items: { type: "string" } },
              httpEndpoint: { $ref: "#/components/schemas/HttpEndpoint" },
              error: { type: "string" },
              inferenceMode: { type: "string", const: "PLATFORM_MANAGED" },
              modelProfileId: { type: "string", format: "uuid" },
              modelProfileBindingId: { type: "string", format: "uuid" },
              modelProfileStatus: { type: "string", enum: ["DRAFT", "VALIDATING", "READY", "DEGRADED", "NON_COMPLIANT", "SUSPENDED", "UNSUPPORTED"] },
              modelProfileComplianceDomain: { type: "string", enum: ["CN_MAINLAND", "GLOBAL"] },
              modelProfileKeyFingerprint: { type: "string" },
            },
          },
        ],
      },
      HttpEndpoint: {
        type: "object",
        required: ["kind", "status"],
        properties: {
          kind: {
            type: "string",
            enum: ["openclaw-webui", "hermes-dashboard"],
          },
          status: { type: "string", enum: ["READY", "UNAVAILABLE"] },
          url: { type: "string", format: "uri" },
          reason: { type: "string" },
        },
      },
      ProviderConnectionDraft: {
        type: "object",
        additionalProperties: false,
        required: ["provider", "name", "config", "credentials"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 48 },
          provider: { type: "string", enum: ["openai", "anthropic", "gemini", "deepseek", "qwen", "moonshot", "zai", "minimax", "baidu-qianfan", "volcengine", "nvidia-nim", "azure-openai", "aws-bedrock", "vertex-ai", "openrouter", "ollama", "vllm", "huggingface", "custom-openai-compatible", "custom-anthropic-compatible"] },
          config: { type: "object", additionalProperties: true },
          credentials: { type: "object", additionalProperties: true, writeOnly: true },
        },
      },
      CreateProviderConnectionInput: {
        type: "object",
        additionalProperties: false,
        required: ["connection", "models", "complianceDomain"],
        properties: {
          connection: { $ref: "#/components/schemas/ProviderConnectionDraft" },
          models: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/components/schemas/ProviderModelSelection" } },
          complianceDomain: { type: "string", enum: ["CN_MAINLAND", "GLOBAL"] },
        },
      },
      InferenceGateway: {
        type: "object",
        required: ["id", "name", "baseUrl", "adminUiUrl", "credentialSource", "status", "validationMessage", "createdAt", "updatedAt"],
        properties: { id: { type: "string" }, name: { type: "string" }, baseUrl: { type: "string", format: "uri" }, adminUiUrl: { type: "string", format: "uri" }, credentialSource: { type: "string", enum: ["ENVIRONMENT", "SECRET_REFERENCE"] }, status: { type: "string", enum: ["UNKNOWN", "READY", "DEGRADED"] }, validationMessage: { type: "string" }, validatedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } },
      },
      CreateModelProfileInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "gatewayId", "publicModelAlias", "complianceDomain"],
        properties: { name: { type: "string", minLength: 2, maxLength: 64 }, description: { type: "string" }, gatewayId: { type: "string" }, publicModelAlias: { type: "string" }, complianceDomain: { type: "string", enum: ["CN_MAINLAND", "GLOBAL"] }, isDefault: { type: "boolean" }, keyPolicy: { type: "object" }, auditPolicy: { type: "object" } },
      },
      UpdateProjectQuotaInput: {
        type: "object",
        additionalProperties: false,
        required: ["hardBudgetUsd", "budgetDuration", "tpmLimit", "maxInstances", "maxMcpIntegrations", "maxKnowledgeBaseIntegrations"],
        properties: {
          hardBudgetUsd: { type: ["number", "null"], minimum: 0 },
          budgetDuration: { type: ["string", "null"], enum: ["1d", "7d", "30d", null] },
          tpmLimit: { type: ["integer", "null"], minimum: 0 },
          maxInstances: { type: ["integer", "null"], minimum: 0 },
          maxMcpIntegrations: { type: ["integer", "null"], minimum: 0 },
          maxKnowledgeBaseIntegrations: { type: ["integer", "null"], minimum: 0 },
        },
      },
      ProjectQuota: {
        allOf: [
          { $ref: "#/components/schemas/UpdateProjectQuotaInput" },
          {
            type: "object",
            required: ["projectId", "litellmTeamId", "syncStatus", "lastSyncedAt", "lastSyncError", "revision", "usage"],
            properties: {
              projectId: { type: "string" },
              litellmTeamId: { type: ["string", "null"] },
              syncStatus: { type: "string", enum: ["pending", "synced", "failed"] },
              lastSyncedAt: { type: ["string", "null"], format: "date-time" },
              lastSyncError: { type: ["string", "null"] },
              revision: { type: "integer", minimum: 1 },
              usage: {
                type: "object",
                required: ["spendUsd", "totalTokens", "instances", "mcpIntegrations", "knowledgeBaseIntegrations"],
                properties: {
                  spendUsd: { type: "number", minimum: 0 },
                  totalTokens: { type: "integer", minimum: 0 },
                  instances: { type: "integer", minimum: 0 },
                  mcpIntegrations: { type: "integer", minimum: 0 },
                  knowledgeBaseIntegrations: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        ],
      },
      ModelProfile: {
        allOf: [{ $ref: "#/components/schemas/CreateModelProfileInput" }, { type: "object", required: ["id", "managementMode", "status", "capabilities", "conditions", "configurationHash", "observedGeneration", "validationMessage", "consumers", "createdAt", "updatedAt"], properties: { id: { type: "string", format: "uuid" }, managementMode: { type: "string", const: "LITELLM_MANAGED" }, status: { type: "string", enum: ["DRAFT", "VALIDATING", "READY", "DEGRADED", "NON_COMPLIANT", "SUSPENDED", "UNSUPPORTED"] }, capabilities: { type: "object", required: ["automaticRouting", "routerType", "sessionAffinity", "adaptiveRouting", "failover", "generalFallback", "contextWindowFallback", "contentPolicyFallback", "retries", "requestAudit"], properties: { automaticRouting: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, routerType: { type: "string", enum: ["COMPLEXITY_ROUTER", "OTHER", "UNKNOWN"] }, complexityTierCount: { type: "integer", minimum: 0 }, sessionAffinity: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, adaptiveRouting: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, failover: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, generalFallback: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, contextWindowFallback: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, contentPolicyFallback: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, retries: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] }, requestAudit: { type: "string", enum: ["ENABLED", "DISABLED", "UNKNOWN"] } } }, conditions: { type: "array", items: { type: "object" } }, configurationHash: { type: "string" }, observedGeneration: { type: "integer", minimum: 1 }, validationMessage: { type: "string" }, consumers: { type: "integer" }, lastSynchronizedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } }],
      },
      ModelProfileConsumer: {
        type: "object",
        required: ["id", "modelProfileId", "instanceId", "liteLLMTeamId", "keyAlias", "keyFingerprint", "status", "createdAt"],
        properties: { id: { type: "string" }, modelProfileId: { type: "string" }, instanceId: { type: "string" }, liteLLMTeamId: { type: "string" }, keyAlias: { type: "string" }, keyFingerprint: { type: "string" }, status: { type: "string", enum: ["ACTIVE", "REVOKED"] }, createdAt: { type: "string", format: "date-time" }, revokedAt: { type: "string", format: "date-time" } },
      },
      ModelProfileAuditEvent: {
        type: "object",
        required: ["eventId", "timestamp", "actor", "type", "modelProfileId", "configurationHash", "complianceDomain", "result", "reason"],
        properties: { eventId: { type: "string" }, timestamp: { type: "string", format: "date-time" }, actor: { type: "string" }, type: { type: "string" }, modelProfileId: { type: "string" }, instanceId: { type: "string" }, configurationHash: { type: "string" }, complianceDomain: { type: "string", enum: ["CN_MAINLAND", "GLOBAL"] }, result: { type: "string", enum: ["SUCCESS", "FAILED"] }, reason: { type: "string" } },
      },
      ProviderModelSelection: {
        type: "object",
        required: ["modelId", "displayName", "modelType"],
        properties: {
          modelId: { type: "string" }, displayName: { type: "string" }, modelType: { type: "string", enum: ["llm", "text-embedding", "speech-to-text"] }, inputFeePerMillionTokens: { type: "number", minimum: 0 }, outputFeePerMillionTokens: { type: "number", minimum: 0 }, feePerAudioMinute: { type: "number", minimum: 0 },
        },
      },
      SandboxPolicyInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "networkAccess", "policyYaml"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 80 },
          description: { type: "string", minLength: 10, maxLength: 320 },
          networkAccess: { type: "string", minLength: 3, maxLength: 160 },
          policyYaml: { type: "string", minLength: 10, maxLength: 64000 },
        },
      },
      SandboxPolicy: {
        allOf: [
          { $ref: "#/components/schemas/SandboxPolicyInput" },
          {
            type: "object",
            required: ["id", "enforcement", "source", "immutable"],
            properties: {
              id: { type: "string" },
              enforcement: { type: "string", const: "ENFORCE" },
              source: { type: "string", enum: ["BUILT_IN", "CUSTOM"] },
              immutable: { type: "boolean" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      SandboxPolicyCatalog: {
        type: "object",
        required: ["defaultPolicyId", "templatePolicyYaml", "data"],
        properties: {
          defaultPolicyId: { type: "string" },
          templatePolicyYaml: { type: "string" },
          data: { type: "array", items: { $ref: "#/components/schemas/SandboxPolicy" } },
        },
      },
      CreateModelDeploymentInput: {
        type: "object",
        additionalProperties: false,
        required: ["providerAccountId", "modelId", "displayName", "modelType"],
        properties: {
          providerAccountId: { type: "string" },
          modelId: { type: "string" },
          displayName: { type: "string" },
          modelType: { type: "string", enum: ["llm", "text-embedding", "speech-to-text"] },
          inputFeePerMillionTokens: { type: "number", minimum: 0 },
          outputFeePerMillionTokens: { type: "number", minimum: 0 },
          feePerAudioMinute: { type: "number", minimum: 0 },
        },
      },
      SandboxAuditEvent: {
        type: "object",
        required: ["id", "timestamp", "source", "category", "severity", "decision", "summary", "raw"],
        properties: {
          id: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          source: { type: "string", enum: ["gateway", "sandbox", "unknown"] },
          category: { type: "string" },
          severity: { type: "string", enum: ["INFO", "LOW", "MED", "HIGH", "CRIT", "UNKNOWN"] },
          decision: { type: "string", enum: ["ALLOWED", "DENIED", "BLOCKED", "APPROVED", "REJECTED", "OBSERVED"] },
          summary: { type: "string" },
          policy: { type: "string" },
          raw: { type: "string" },
        },
      },
      ProviderValidationCheck: {
        type: "object",
        required: ["id", "label", "status"],
        properties: {
          id: { type: "string", enum: ["endpoint", "catalog", "credentials", "inference"] },
          label: { type: "string" },
          status: { type: "string", enum: ["PASS", "FAIL", "SKIP"] },
        },
      },
      ProviderAccount: {
        type: "object",
        required: ["id", "name", "providerKind", "presetId", "endpoint", "config", "complianceDomain", "endpointRegion", "crossBorderTransfer", "discoveredModels", "credentialState", "status", "checks", "validationMessage", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          providerKind: { type: "string" },
          presetId: { type: "string" },
          endpoint: { type: "string", format: "uri" },
          config: { type: "object", additionalProperties: true },
          complianceDomain: { type: "string", enum: ["CN_MAINLAND", "GLOBAL"] },
          endpointRegion: { type: "string" },
          crossBorderTransfer: { type: "boolean", const: false },
          discoveredModels: { type: "array", items: { type: "string" } },
          credentialState: { type: "string", const: "STORED" },
          status: { type: "string", enum: ["VALIDATED", "DEGRADED", "FAILED"] },
          checks: { type: "array", items: { $ref: "#/components/schemas/ProviderValidationCheck" } },
          validationMessage: { type: "string" },
          validationLatencyMs: { type: "integer" },
          validatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ProviderAccountCollection: {
        type: "object",
        required: ["data"],
        properties: { data: { type: "array", items: { $ref: "#/components/schemas/ProviderAccount" } } },
      },
      ProviderDiscoveryResult: {
        type: "object",
        required: ["providerKind", "mode", "models", "checks", "message"],
        properties: { providerKind: { type: "string" }, mode: { type: "string", enum: ["remote", "suggested", "manual"] }, models: { type: "array", items: { $ref: "#/components/schemas/ProviderModelSelection" } }, checks: { type: "array", items: { $ref: "#/components/schemas/ProviderValidationCheck" } }, message: { type: "string" }, latencyMs: { type: "integer" } },
      },
      ProviderConnectionCreationResult: {
        type: "object",
        required: ["account", "models", "failures"],
        properties: { account: { $ref: "#/components/schemas/ProviderAccount" }, models: { type: "array", items: { $ref: "#/components/schemas/ModelDeployment" } }, failures: { type: "array", items: { type: "object", required: ["model", "message"], properties: { model: { $ref: "#/components/schemas/ProviderModelSelection" }, message: { type: "string" } } } } },
      },
      ModelDeployment: {
        allOf: [
          { $ref: "#/components/schemas/CreateModelDeploymentInput" },
          { type: "object", required: ["id", "isDefault", "providerPresetId", "providerName", "endpoint", "complianceDomain", "endpointRegion", "crossBorderTransfer", "litellmModelName", "status", "checks", "validationMessage", "createdAt", "updatedAt"], properties: {
            id: { type: "string" }, isDefault: { type: "boolean" }, providerPresetId: { type: "string" }, providerName: { type: "string" }, endpoint: { type: "string", format: "uri" }, complianceDomain: { type: "string", enum: ["CN_MAINLAND", "GLOBAL"] }, endpointRegion: { type: "string" }, crossBorderTransfer: { type: "boolean", const: false }, litellmModelName: { type: "string" }, status: { type: "string", enum: ["VALIDATED", "DEGRADED", "FAILED"] }, checks: { type: "array", items: { $ref: "#/components/schemas/ProviderValidationCheck" } }, validationMessage: { type: "string" }, validationLatencyMs: { type: "integer" }, validatedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
          } },
        ],
      },
      ModelCostSummary: {
        type: "object",
        required: ["currency", "totalSpendUsd", "totalTokens", "promptTokens", "completionTokens", "requests", "unknownCostRequests", "comparison"],
        properties: {
          currency: { type: "string", const: "USD" }, totalSpendUsd: { type: "number" }, totalTokens: { type: "integer" }, promptTokens: { type: "integer" }, completionTokens: { type: "integer" }, requests: { type: "integer" }, unknownCostRequests: { type: "integer" }, highestCostInstance: { type: "object" }, highestCostModel: { type: "object" }, comparison: { type: "object" },
        },
      },
      ModelCostActivity: { type: "object", required: ["currency", "granularity", "items", "legend"], properties: { currency: { type: "string", const: "USD" }, granularity: { type: "string" }, items: { type: "array", items: { type: "object" } }, legend: { type: "object" } } },
      ModelCostRanking: { type: "object", required: ["currency", "items", "totalSpendUsd"], properties: { currency: { type: "string", const: "USD" }, items: { type: "array", items: { type: "object" } }, totalSpendUsd: { type: "number" } } },
      ModelCostTrend: { type: "object", required: ["currency", "dates", "series"], properties: { currency: { type: "string", const: "USD" }, dates: { type: "array", items: { type: "string" } }, series: { type: "array", items: { type: "object" } } } },
      ModelCostBreakdown: { type: "object", required: ["currency", "items", "total", "page", "pageSize", "filterOptions"], properties: { currency: { type: "string", const: "USD" }, items: { type: "array", items: { type: "object" } }, total: { type: "integer" }, page: { type: "integer" }, pageSize: { type: "integer" }, filterOptions: { type: "object" } } },
      AgentCollection: {
        type: "object",
        required: ["data"],
        properties: { data: { type: "array", items: { $ref: "#/components/schemas/Agent" } } },
      },
      TerminalSession: {
        type: "object",
        required: ["id", "expiresAt", "websocketUrl"],
        properties: {
          id: { type: "string", format: "uuid" },
          expiresAt: { type: "string", format: "date-time" },
          websocketUrl: { type: "string", description: "Relative WebSocket upgrade path; valid once for five minutes." },
        },
      },
      CreateTerminalSessionInput: {
        type: "object",
        required: ["targetId"],
        properties: { targetId: { type: "string" } },
      },
      TerminalTarget: {
        type: "object",
        required: ["id", "containerName", "primary", "available", "shells"],
        properties: {
          id: { type: "string" },
          containerName: { type: "string" },
          displayName: { type: "string" },
          primary: { type: "boolean" },
          available: { type: "boolean" },
          reason: { type: "string" },
          shells: { type: "array", items: { type: "string" } },
        },
      },
      RuntimeStatus: {
        type: "object",
        required: ["mode", "terminal"],
        properties: {
          mode: { type: "string" },
          terminal: {
            type: "object",
            required: ["available", "kind", "transport"],
            properties: {
              available: { type: "boolean" },
              kind: { type: "string", const: "nemoclaw-tui" },
              transport: { type: "string", enum: ["nemoclaw", "openshell", "none"] },
              reason: { type: "string" },
            },
          },
        },
      },
      DeleteAgentResult: {
        type: "object",
        required: ["id", "status", "previousStatus"],
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", const: "DESTROYED" },
          previousStatus: { type: "string", const: "DESTROYING" },
        },
      },
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
    },
    responses: {
      Error: { description: "Request failed", ...json({ $ref: "#/components/schemas/Error" }) },
    },
  },
} as const;
