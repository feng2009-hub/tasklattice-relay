const json = (schema: object) => ({
  content: { "application/json": { schema } },
});

const agentId = {
  name: "agentId",
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

const extensionKind = {
  name: "kind",
  in: "path",
  required: true,
  schema: { type: "string", enum: ["skills", "mcp-servers", "knowledge-sources"] },
} as const;

const extensionId = {
  name: "extensionId",
  in: "path",
  required: true,
  schema: { type: "string" },
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
    "/extensions": {
      get: {
        operationId: "getExtensionCatalog",
        summary: "Read the SQLite-backed extension and Agent Role catalog",
        responses: {
          "200": { description: "Extension catalog", ...json({ $ref: "#/components/schemas/ExtensionCatalog" }) },
        },
      },
    },
    "/extensions/{kind}": {
      parameters: [extensionKind],
      post: {
        operationId: "createExtension",
        summary: "Create a Skill, MCP server, or Knowledge source",
        requestBody: { required: true, ...json({ oneOf: [
          { $ref: "#/components/schemas/SkillDefinitionInput" },
          { $ref: "#/components/schemas/McpServerDefinitionInput" },
          { $ref: "#/components/schemas/KnowledgeSourceDefinitionInput" },
        ] }) },
        responses: {
          "201": { description: "Created extension", ...json({ type: "object" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/extensions/{kind}/{extensionId}": {
      parameters: [extensionKind, extensionId],
      put: {
        operationId: "updateExtension",
        summary: "Update a persisted extension definition",
        requestBody: { required: true, ...json({ type: "object" }) },
        responses: {
          "200": { description: "Updated extension", ...json({ type: "object" }) },
          "400": { $ref: "#/components/responses/Error" },
        },
      },
      delete: {
        operationId: "deleteExtension",
        summary: "Delete an extension that is not assigned to a Role or Instance",
        responses: {
          "200": { description: "Extension deleted", ...json({ type: "object", required: ["message"], properties: { message: { type: "string" } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/providers": {
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
    "/providers/discover": {
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
    "/providers/{providerId}/validate": {
      parameters: [providerId],
      post: {
        operationId: "revalidateProviderAccount",
        summary: "Re-run Endpoint, credential, and catalog validation",
        responses: {
          "200": { description: "Updated validation result", ...json({ $ref: "#/components/schemas/ProviderAccount" }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/providers/{providerId}": {
      parameters: [providerId],
      delete: {
        operationId: "deleteProviderAccount",
        summary: "Delete an unused Provider Account and its LiteLLM models",
        responses: {
          "200": { description: "Provider Account deleted", ...json({ type: "object", required: ["message"], properties: { message: { type: "string" } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/providers/models": {
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
    "/providers/models/{modelId}/default": {
      parameters: [{ name: "modelId", in: "path", required: true, schema: { type: "string" } }],
      post: {
        operationId: "markModelDeploymentAsDefault",
        summary: "Mark one validated LLM deployment as the global default",
        responses: {
          "200": { description: "Default model deployment", ...json({ $ref: "#/components/schemas/ModelDeployment" }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/costs": {
      get: {
        operationId: "getCostReport",
        summary: "Aggregate LiteLLM spend by Instance key and model Endpoint",
        parameters: [
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
        ],
        responses: { "200": { description: "Cost report", ...json({ $ref: "#/components/schemas/CostReport" }) } },
      },
    },
    "/policies": {
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
    "/policies/{policyId}": {
      parameters: [policyId],
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
    "/runtime": {
      get: {
        operationId: "getRuntimeStatus",
        summary: "Read NemoClaw TUI runtime capability",
        responses: {
          "200": { description: "Runtime capability", ...json({ $ref: "#/components/schemas/RuntimeStatus" }) },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/agents": {
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
    "/agents/{agentId}": {
      parameters: [agentId],
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
    "/agents/{agentId}/terminal-sessions": {
      parameters: [agentId],
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
    "/agents/{agentId}/terminal-targets": {
      parameters: [agentId],
      get: {
        operationId: "getTerminalTargets",
        summary: "List interactive terminal targets for a running Agent",
        responses: {
          "200": { description: "Terminal targets", ...json({ type: "object", required: ["data"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/TerminalTarget" } } } }) },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/agents/{agentId}/audit": {
      parameters: [agentId],
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
          localEnabled: { type: "boolean", const: true },
          mode: { type: "string", enum: ["local", "local-sso"] },
          providerName: { type: "string" },
          ssoEnabled: { type: "boolean" },
        },
      },
      AuthUser: {
        type: "object",
        required: ["displayName", "email", "provider", "username"],
        properties: {
          displayName: { type: "string" },
          email: { type: "string" },
          provider: { type: "string", enum: ["local", "sso"] },
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
          identity: { type: "object", required: ["type", "username"], properties: { type: { type: "string", const: "authenticated" }, username: { type: "string" } } },
          user: { $ref: "#/components/schemas/AuthUser" },
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
        required: ["name", "endpoint", "transport", "authReference", "parameters", "status", "tools"],
        properties: {
          name: { type: "string" }, endpoint: { type: "string", format: "uri" }, transport: { type: "string", enum: ["Streamable HTTP", "SSE"] },
          authReference: { type: "string" }, parameters: { type: "string", description: "Serialized JSON object." },
          status: { type: "string", enum: ["HEALTHY", "PERMISSION_REQUIRED", "UNCHECKED", "UNAVAILABLE"] }, tools: { type: "integer", minimum: 0 },
        },
      },
      McpServerDefinition: {
        allOf: [
          { $ref: "#/components/schemas/McpServerDefinitionInput" },
          { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        ],
      },
      KnowledgeSourceDefinitionInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "endpoint", "mode", "authReference", "status", "topK"],
        properties: {
          name: { type: "string" }, description: { type: "string" }, endpoint: { type: "string", format: "uri" },
          mode: { type: "string", enum: ["Hybrid", "Vector", "Keyword"] }, authReference: { type: "string" },
          status: { type: "string", enum: ["READY", "UNCHECKED"] }, topK: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
      KnowledgeSourceDefinition: {
        allOf: [
          { $ref: "#/components/schemas/KnowledgeSourceDefinitionInput" },
          { type: "object", required: ["id"], properties: { id: { type: "string" } } },
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
      ExtensionCatalog: {
        type: "object",
        required: ["skills", "mcpServers", "knowledgeSources", "specializations"],
        properties: {
          skills: { type: "array", items: { $ref: "#/components/schemas/SkillDefinition" } },
          mcpServers: { type: "array", items: { $ref: "#/components/schemas/McpServerDefinition" } },
          knowledgeSources: { type: "array", items: { $ref: "#/components/schemas/KnowledgeSourceDefinition" } },
          specializations: { type: "array", items: { $ref: "#/components/schemas/AgentSpecializationDefinition" } },
        },
      },
      CreateAgentInput: {
        type: "object",
        additionalProperties: false,
        required: ["name", "runtime", "agentPlatform", "modelDeploymentId", "systemPrompt"],
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
          modelDeploymentId: { type: "string", description: "Validated LLM deployment selected for this Instance." },
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
            required: ["id", "policyId", "providerAccountId", "providerName", "model", "modelType", "costKeyAlias", "sandboxName", "status", "createdAt", "updatedAt", "logs"],
            properties: {
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
        required: ["connection", "models"],
        properties: {
          connection: { $ref: "#/components/schemas/ProviderConnectionDraft" },
          models: { type: "array", minItems: 1, maxItems: 100, items: { $ref: "#/components/schemas/ProviderModelSelection" } },
        },
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
        required: ["id", "name", "providerKind", "presetId", "endpoint", "config", "discoveredModels", "credentialState", "status", "checks", "validationMessage", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          providerKind: { type: "string" },
          presetId: { type: "string" },
          endpoint: { type: "string", format: "uri" },
          config: { type: "object", additionalProperties: true },
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
          { type: "object", required: ["id", "isDefault", "providerPresetId", "providerName", "endpoint", "litellmModelName", "status", "checks", "validationMessage", "createdAt", "updatedAt"], properties: {
            id: { type: "string" }, isDefault: { type: "boolean" }, providerPresetId: { type: "string" }, providerName: { type: "string" }, endpoint: { type: "string", format: "uri" }, litellmModelName: { type: "string" }, status: { type: "string", enum: ["VALIDATED", "DEGRADED", "FAILED"] }, checks: { type: "array", items: { $ref: "#/components/schemas/ProviderValidationCheck" } }, validationMessage: { type: "string" }, validationLatencyMs: { type: "integer" }, validatedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
          } },
        ],
      },
      CostReport: {
        type: "object",
        required: ["currency", "from", "to", "totalSpend", "requestCount", "inputTokens", "outputTokens", "byInstance", "byModel", "byProviderAccount", "daily"],
        properties: {
          currency: { type: "string", const: "USD" }, from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, totalSpend: { type: "number" }, requestCount: { type: "integer" }, inputTokens: { type: "integer" }, outputTokens: { type: "integer" }, byInstance: { type: "array", items: { type: "object" } }, byModel: { type: "array", items: { type: "object" } }, byProviderAccount: { type: "array", items: { type: "object" } }, daily: { type: "array", items: { type: "object" } },
        },
      },
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
