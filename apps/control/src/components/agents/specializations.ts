export const specializationIds = [
  "general-purpose",
  "hr",
  "research-analyst",
  "devops-engineer",
  "customer-support",
  "custom",
] as const;

export type SpecializationId = (typeof specializationIds)[number];

export type Specialization = {
  defaultKnowledgeSourceIds: string[];
  defaultMcpServerIds: string[];
  defaultSkillIds: string[];
  description: string;
  icon: "briefcase" | "headphones" | "settings" | "sparkles" | "telescope" | "users";
  id: SpecializationId;
  name: string;
  systemPrompt: string;
};

export const specializations: readonly Specialization[] = [
  {
    id: "general-purpose",
    name: "General Purpose",
    icon: "sparkles",
    description: "A flexible Agent that starts without preselected capabilities.",
    systemPrompt: "You are a focused internal assistant. Complete the user's request inside the OpenShell sandbox and explain the evidence clearly.",
    defaultSkillIds: [],
    defaultMcpServerIds: [],
    defaultKnowledgeSourceIds: [],
  },
  {
    id: "hr",
    name: "HR",
    icon: "users",
    description: "Provides support for HR policies, employee onboarding, benefits, and internal HR processes.",
    systemPrompt: "You are an HR support Agent. Answer employee questions using approved company policies and connected knowledge sources. Be clear about policy scope, protect confidential employee data, and escalate decisions that require a People Operations owner.",
    defaultSkillIds: ["employee-policy-search", "document-summarization", "onboarding-guidance"],
    defaultMcpServerIds: ["hr-knowledge-base", "workday"],
    defaultKnowledgeSourceIds: ["company-hr-handbook"],
  },
  {
    id: "research-analyst",
    name: "Research Analyst",
    icon: "telescope",
    description: "Collects evidence, compares sources, and produces citation-backed research.",
    systemPrompt: "You are a research analyst. Investigate the request using approved sources, distinguish evidence from inference, cite material claims, surface uncertainty, and provide a concise decision-ready synthesis.",
    defaultSkillIds: ["skill-web-research", "citation-builder", "document-summarization"],
    defaultMcpServerIds: ["mcp-github-tools", "google-drive"],
    defaultKnowledgeSourceIds: ["research-library"],
  },
  {
    id: "devops-engineer",
    name: "DevOps Engineer",
    icon: "settings",
    description: "Investigates operational issues and reviews infrastructure changes safely.",
    systemPrompt: "You are a DevOps engineering Agent. Diagnose from observable evidence, preserve production safety, explain operational risk, and propose reversible changes with explicit verification and rollback steps.",
    defaultSkillIds: ["incident-triage", "infrastructure-change-review"],
    defaultMcpServerIds: ["mcp-github-tools", "slack"],
    defaultKnowledgeSourceIds: ["kb-incident-history"],
  },
  {
    id: "customer-support",
    name: "Customer Support",
    icon: "headphones",
    description: "Resolves product questions using approved support knowledge and escalation paths.",
    systemPrompt: "You are a customer support Agent. Understand the customer's goal, use approved support knowledge, give precise next actions, avoid unsupported claims, and escalate account or product issues that require a human owner.",
    defaultSkillIds: ["customer-conversation-summary", "knowledge-answering"],
    defaultMcpServerIds: ["google-drive", "slack"],
    defaultKnowledgeSourceIds: ["support-handbook"],
  },
  {
    id: "custom",
    name: "Custom",
    icon: "briefcase",
    description: "Define custom instructions and assemble capabilities from the available catalog.",
    systemPrompt: "",
    defaultSkillIds: [],
    defaultMcpServerIds: [],
    defaultKnowledgeSourceIds: [],
  },
];

export function getSpecialization(id: SpecializationId): Specialization {
  return specializations.find((item) => item.id === id) ?? specializations[0]!;
}
