import adminEn from "../../../../docs/help/en-US/roles/admin.md?raw";
import approverEn from "../../../../docs/help/en-US/roles/approver.md?raw";
import auditorEn from "../../../../docs/help/en-US/roles/auditor.md?raw";
import developerEn from "../../../../docs/help/en-US/roles/developer.md?raw";
import userEn from "../../../../docs/help/en-US/roles/user.md?raw";
import maintenanceEn from "../../../../docs/help/en-US/operations/maintenance.md?raw";
import troubleshootingEn from "../../../../docs/help/en-US/operations/troubleshooting.md?raw";
import adminZh from "../../../../docs/help/zh-CN/roles/admin.md?raw";
import approverZh from "../../../../docs/help/zh-CN/roles/approver.md?raw";
import auditorZh from "../../../../docs/help/zh-CN/roles/auditor.md?raw";
import developerZh from "../../../../docs/help/zh-CN/roles/developer.md?raw";
import userZh from "../../../../docs/help/zh-CN/roles/user.md?raw";
import maintenanceZh from "../../../../docs/help/zh-CN/operations/maintenance.md?raw";
import troubleshootingZh from "../../../../docs/help/zh-CN/operations/troubleshooting.md?raw";
import type { AccountLanguage } from "@/services/personal-profile";

export const helpTopicIds = [
  "admin",
  "developer",
  "approver",
  "auditor",
  "user",
  "maintenance",
  "troubleshooting",
] as const;

export type HelpTopicId = (typeof helpTopicIds)[number];

const helpRoutes = [
  "/$projectId",
  "/$projectId/access-policies",
  "/$projectId/agent-garden",
  "/$projectId/audit-logs",
  "/$projectId/cost",
  "/$projectId/instances",
  "/$projectId/knowledge-base",
  "/$projectId/mcp-servers",
  "/$projectId/memory",
  "/$projectId/requests",
  "/$projectId/requests/new",
  "/$projectId/runtime-policies",
  "/$projectId/setting",
  "/$projectId/skills",
  "/$projectId/traces",
] as const;

export type HelpRoute = (typeof helpRoutes)[number];

export interface HelpTopic {
  body: string;
  category: "operations" | "role";
  id: HelpTopicId;
  navTitle: string;
  preview?: boolean;
}

export interface HelpContent {
  browse: string;
  currentRole: string;
  description: string;
  navigation: {
    operations: string;
    operationsDescription: string;
    title: string;
    userGuides: string;
    userGuidesDescription: string;
  };
  preview: string;
  title: string;
  topics: Record<HelpTopicId, HelpTopic>;
}

export function isHelpTopicId(value: unknown): value is HelpTopicId {
  return typeof value === "string"
    && (helpTopicIds as readonly string[]).includes(value);
}

export function getHelpRoute(href: string | undefined): HelpRoute | null {
  if (!href?.startsWith("/__project__")) return null;
  const suffix = href.slice("/__project__".length);
  const route = `/$projectId${suffix}`;
  return (helpRoutes as readonly string[]).includes(route)
    ? route as HelpRoute
    : null;
}

const englishContent: HelpContent = {
  browse: "Browse documentation",
  currentRole: "Current role",
  description: "Role-based product guidance and operational runbooks for TaskLattice Relay.",
  navigation: {
    operations: "Operations",
    operationsDescription: "Maintain and recover the platform.",
    title: "Documentation topics",
    userGuides: "User guides",
    userGuidesDescription: "Work safely within your Project role.",
  },
  preview: "Preview workflow",
  title: "Help & documentation",
  topics: {
    admin: { body: adminEn, category: "role", id: "admin", navTitle: "Administrator" },
    developer: { body: developerEn, category: "role", id: "developer", navTitle: "Developer" },
    approver: { body: approverEn, category: "role", id: "approver", navTitle: "Approver", preview: true },
    auditor: { body: auditorEn, category: "role", id: "auditor", navTitle: "Auditor" },
    user: { body: userEn, category: "role", id: "user", navTitle: "User" },
    maintenance: { body: maintenanceEn, category: "operations", id: "maintenance", navTitle: "Daily maintenance" },
    troubleshooting: { body: troubleshootingEn, category: "operations", id: "troubleshooting", navTitle: "Troubleshooting" },
  },
};

const chineseContent: HelpContent = {
  browse: "浏览文档",
  currentRole: "当前角色",
  description: "面向不同项目角色的使用指南，以及 TaskLattice Relay 运维手册。",
  navigation: {
    operations: "运维文档",
    operationsDescription: "维护平台并处理故障。",
    title: "文档主题",
    userGuides: "使用文档",
    userGuidesDescription: "在项目角色的权限边界内安全工作。",
  },
  preview: "预览流程",
  title: "帮助与文档",
  topics: {
    admin: { body: adminZh, category: "role", id: "admin", navTitle: "管理员" },
    developer: { body: developerZh, category: "role", id: "developer", navTitle: "开发者" },
    approver: { body: approverZh, category: "role", id: "approver", navTitle: "审批者", preview: true },
    auditor: { body: auditorZh, category: "role", id: "auditor", navTitle: "审计员" },
    user: { body: userZh, category: "role", id: "user", navTitle: "普通用户" },
    maintenance: { body: maintenanceZh, category: "operations", id: "maintenance", navTitle: "日常维护" },
    troubleshooting: { body: troubleshootingZh, category: "operations", id: "troubleshooting", navTitle: "故障排查" },
  },
};

export function getHelpContent(language: AccountLanguage): HelpContent {
  return language === "zh-CN" ? chineseContent : englishContent;
}
