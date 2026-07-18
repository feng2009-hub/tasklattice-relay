export type QuotaPreview = {
  endpoint: string;
  id: string;
  limit: string;
  model: string;
  status: "ACTIVE" | "DRAFT";
  usage: string;
};

export const quotaPreviews: QuotaPreview[] = [
  {
    endpoint: "api.deepseek.internal",
    id: "quota-deepseek-chat",
    limit: "600 RPM · 2M TPM",
    model: "deepseek-chat",
    status: "ACTIVE",
    usage: "68%",
  },
  {
    endpoint: "api.deepseek.internal",
    id: "quota-deepseek-reasoner",
    limit: "120 RPM · 800K TPM",
    model: "deepseek-reasoner",
    status: "DRAFT",
    usage: "—",
  },
  {
    endpoint: "embedding.platform.internal",
    id: "quota-embedding-v3",
    limit: "1K RPM · 5M TPM",
    model: "embedding-v3",
    status: "ACTIVE",
    usage: "42%",
  },
];

export type SkillPreview = {
  bindings: number;
  category: "Customer Support" | "Data" | "Developer Tools" | "HR" | "Knowledge" | "Operations" | "Research";
  description: string;
  digest: string;
  endpoint: string;
  id: string;
  name: string;
  owner: string;
  permissions: number;
  status: "PUBLISHED" | "DRAFT";
  version: string;
};

export const skillPreviews: SkillPreview[] = [
  {
    bindings: 4,
    category: "HR",
    description: "Find and answer questions about company HR policies.",
    digest: "sha256:1d83…8d12",
    endpoint: "https://skills.internal.example/employee-policy-search.tar.zst",
    id: "employee-policy-search",
    name: "Employee Policy Search",
    owner: "People Operations",
    permissions: 1,
    status: "PUBLISHED",
    version: "1.2.0",
  },
  {
    bindings: 8,
    category: "Knowledge",
    description: "Summarize HR documents and reports.",
    digest: "sha256:b92f…3b06",
    endpoint: "https://skills.internal.example/document-summarization.tar.zst",
    id: "document-summarization",
    name: "Document Summarization",
    owner: "Knowledge Team",
    permissions: 1,
    status: "PUBLISHED",
    version: "2.0.1",
  },
  {
    bindings: 3,
    category: "HR",
    description: "Guide new hires through onboarding steps and resources.",
    digest: "sha256:8aa7…011c",
    endpoint: "https://skills.internal.example/onboarding-guidance.tar.zst",
    id: "onboarding-guidance",
    name: "Onboarding Guidance",
    owner: "People Operations",
    permissions: 2,
    status: "PUBLISHED",
    version: "1.1.0",
  },
  {
    bindings: 5,
    category: "Data",
    description: "Extract structured data from documents and forms.",
    digest: "sha256:f6f1…1c0d",
    endpoint: "https://skills.internal.example/data-extraction.tar.zst",
    id: "data-extraction",
    name: "Data Extraction",
    owner: "Data Platform",
    permissions: 2,
    status: "PUBLISHED",
    version: "1.3.0",
  },
  {
    bindings: 7,
    category: "Research",
    description: "Create traceable citations for research findings.",
    digest: "sha256:2c81…77f2",
    endpoint: "https://skills.internal.example/citation-builder.tar.zst",
    id: "citation-builder",
    name: "Citation Builder",
    owner: "Knowledge Team",
    permissions: 1,
    status: "PUBLISHED",
    version: "1.5.0",
  },
  {
    bindings: 9,
    category: "Operations",
    description: "Triage service alerts and assemble an evidence-backed incident summary.",
    digest: "sha256:8a20…5f02",
    endpoint: "https://skills.internal.example/incident-triage.tar.zst",
    id: "incident-triage",
    name: "Incident Triage",
    owner: "Platform Operations",
    permissions: 3,
    status: "PUBLISHED",
    version: "2.2.0",
  },
  {
    bindings: 6,
    category: "Operations",
    description: "Review infrastructure changes against operational safeguards.",
    digest: "sha256:22d4…10ac",
    endpoint: "https://skills.internal.example/infrastructure-change-review.tar.zst",
    id: "infrastructure-change-review",
    name: "Infrastructure Change Review",
    owner: "Platform Operations",
    permissions: 4,
    status: "PUBLISHED",
    version: "1.8.0",
  },
  {
    bindings: 12,
    category: "Customer Support",
    description: "Summarize customer conversations and identify the requested outcome.",
    digest: "sha256:51b9…70ee",
    endpoint: "https://skills.internal.example/customer-conversation-summary.tar.zst",
    id: "customer-conversation-summary",
    name: "Customer Conversation Summary",
    owner: "Customer Experience",
    permissions: 2,
    status: "PUBLISHED",
    version: "1.4.0",
  },
  {
    bindings: 15,
    category: "Customer Support",
    description: "Answer product questions using approved support knowledge.",
    digest: "sha256:64cc…c501",
    endpoint: "https://skills.internal.example/knowledge-answering.tar.zst",
    id: "knowledge-answering",
    name: "Knowledge Answering",
    owner: "Customer Experience",
    permissions: 1,
    status: "PUBLISHED",
    version: "2.3.0",
  },
  {
    bindings: 6,
    category: "Data",
    description: "Run governed read-only queries and return structured results.",
    digest: "sha256:9a76…12f4",
    endpoint: "https://skills.internal.example/sql-query.tar.zst",
    id: "skill-sql-query",
    name: "SQL Query",
    owner: "Data Platform",
    permissions: 2,
    status: "PUBLISHED",
    version: "1.4.2",
  },
  {
    bindings: 2,
    category: "Developer Tools",
    description: "Generate and revise code inside an approved workspace boundary.",
    digest: "Pending source check",
    endpoint: "https://skills.internal.example/code-generation.tar.zst",
    id: "skill-code-generation",
    name: "Code Generation",
    owner: "Developer Experience",
    permissions: 4,
    status: "DRAFT",
    version: "0.9.0",
  },
  {
    bindings: 11,
    category: "Research",
    description: "Collect public sources and produce citation-backed research notes.",
    digest: "sha256:4bd3…88a1",
    endpoint: "https://skills.internal.example/web-research.tar.zst",
    id: "skill-web-research",
    name: "Web Research",
    owner: "Knowledge Team",
    permissions: 3,
    status: "PUBLISHED",
    version: "2.1.0",
  },
];

export type McpServerPreview = {
  authReference: string;
  endpoint: string;
  id: string;
  name: string;
  parameters: string;
  status: "HEALTHY" | "PERMISSION_REQUIRED" | "UNCHECKED" | "UNAVAILABLE";
  tools: number;
  transport: "Streamable HTTP" | "SSE";
};

export const mcpServerPreviews: McpServerPreview[] = [
  {
    authReference: "vault://people/hr-knowledge",
    endpoint: "https://mcp.internal.example/hr-knowledge",
    id: "hr-knowledge-base",
    name: "HR Knowledge Base",
    parameters: '{\n  "scope": "employee-handbook"\n}',
    status: "HEALTHY",
    tools: 6,
    transport: "Streamable HTTP",
  },
  {
    authReference: "vault://people/workday-reader",
    endpoint: "https://mcp.internal.example/workday",
    id: "workday",
    name: "Workday",
    parameters: '{\n  "access": "employee-read"\n}',
    status: "HEALTHY",
    tools: 9,
    transport: "Streamable HTTP",
  },
  {
    authReference: "Not configured",
    endpoint: "https://mcp.internal.example/slack",
    id: "slack",
    name: "Slack",
    parameters: '{\n  "channels": []\n}',
    status: "UNCHECKED",
    tools: 14,
    transport: "Streamable HTTP",
  },
  {
    authReference: "vault://workspace/google-drive-reader",
    endpoint: "https://mcp.internal.example/google-drive",
    id: "google-drive",
    name: "Google Drive",
    parameters: '{\n  "access": "read-only"\n}',
    status: "HEALTHY",
    tools: 8,
    transport: "Streamable HTTP",
  },
  {
    authReference: "vault://platform/github-readonly",
    endpoint: "https://mcp.internal.example/github",
    id: "mcp-github-tools",
    name: "GitHub Tools",
    parameters: '{\n  "toolsets": ["repos", "issues", "pull_requests"]\n}',
    status: "HEALTHY",
    tools: 18,
    transport: "Streamable HTTP",
  },
  {
    authReference: "vault://data/warehouse-reader",
    endpoint: "https://mcp.internal.example/warehouse/events",
    id: "mcp-data-warehouse",
    name: "Data Warehouse",
    parameters: '{\n  "database": "analytics",\n  "readOnly": true\n}',
    status: "UNCHECKED",
    tools: 7,
    transport: "SSE",
  },
];

export type KnowledgeSourcePreview = {
  authReference: string;
  description: string;
  endpoint: string;
  id: string;
  mode: "Hybrid" | "Vector" | "Keyword";
  name: string;
  status: "READY" | "UNCHECKED";
  topK: number;
};

export const knowledgeSourcePreviews: KnowledgeSourcePreview[] = [
  {
    authReference: "vault://knowledge/hr-handbook",
    description: "Current company policies, benefits, onboarding, and people operations guidance.",
    endpoint: "https://knowledge.internal.example/hr-handbook",
    id: "company-hr-handbook",
    mode: "Hybrid",
    name: "Company HR Handbook",
    status: "READY",
    topK: 8,
  },
  {
    authReference: "vault://knowledge/research-library",
    description: "Approved research sources and internal citation guidance.",
    endpoint: "https://knowledge.internal.example/research-library",
    id: "research-library",
    mode: "Hybrid",
    name: "Research Library",
    status: "READY",
    topK: 10,
  },
  {
    authReference: "vault://knowledge/support-handbook",
    description: "Product support policies, troubleshooting guides, and escalation paths.",
    endpoint: "https://knowledge.internal.example/support-handbook",
    id: "support-handbook",
    mode: "Hybrid",
    name: "Support Handbook",
    status: "READY",
    topK: 8,
  },
  {
    authReference: "vault://knowledge/product-docs",
    description: "Published product specifications, runbooks, and release notes.",
    endpoint: "https://knowledge.internal.example/v1/search",
    id: "kb-product-docs",
    mode: "Hybrid",
    name: "Product Documentation",
    status: "READY",
    topK: 8,
  },
  {
    authReference: "vault://knowledge/incidents",
    description: "Resolved incident timelines and operational learning notes.",
    endpoint: "https://knowledge.internal.example/incidents/query",
    id: "kb-incident-history",
    mode: "Vector",
    name: "Incident History",
    status: "UNCHECKED",
    topK: 5,
  },
];

export type TicketPreview = {
  actionOwner: string;
  completedAt?: string;
  currentStep: string;
  id: string;
  kind: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  target: string;
};

export const pendingTicketPreviews: TicketPreview[] = [
  {
    actionOwner: "Platform Quota Approvers",
    currentStep: "Quota approval",
    id: "REQ-2026-0715",
    kind: "Quota increase",
    status: "PENDING",
    target: "deepseek-chat",
  },
  {
    actionOwner: "Security Review",
    currentStep: "Security review",
    id: "REQ-2026-0712",
    kind: "Skill binding",
    status: "PENDING",
    target: "SQL Query",
  },
];

export const historyTicketPreviews: TicketPreview[] = [
  {
    actionOwner: "Platform Operations",
    completedAt: "Jul 12",
    currentStep: "Completed",
    id: "REQ-2026-0688",
    kind: "Instance update",
    status: "APPROVED",
    target: "Research Assistant",
  },
  {
    actionOwner: "Platform Quota Approvers",
    completedAt: "Jul 08",
    currentStep: "Closed",
    id: "REQ-2026-0661",
    kind: "Quota request",
    status: "REJECTED",
    target: "embedding-v3",
  },
];
