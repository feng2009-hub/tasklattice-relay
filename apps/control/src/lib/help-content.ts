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
import type { SupportedLanguage } from "@/i18n/config";

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
  preview?: boolean;
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

const topicMetadata: Record<
  HelpTopicId,
  Omit<HelpTopic, "body">
> = {
  admin: { category: "role", id: "admin" },
  approver: { category: "role", id: "approver", preview: true },
  auditor: { category: "role", id: "auditor" },
  developer: { category: "role", id: "developer" },
  maintenance: { category: "operations", id: "maintenance" },
  troubleshooting: { category: "operations", id: "troubleshooting" },
  user: { category: "role", id: "user" },
};

const topicBodies: Record<
  SupportedLanguage,
  Record<HelpTopicId, string>
> = {
  "en-US": {
    admin: adminEn,
    approver: approverEn,
    auditor: auditorEn,
    developer: developerEn,
    maintenance: maintenanceEn,
    troubleshooting: troubleshootingEn,
    user: userEn,
  },
  "zh-CN": {
    admin: adminZh,
    approver: approverZh,
    auditor: auditorZh,
    developer: developerZh,
    maintenance: maintenanceZh,
    troubleshooting: troubleshootingZh,
    user: userZh,
  },
};

export function getHelpTopics(
  language: SupportedLanguage,
): Record<HelpTopicId, HelpTopic> {
  return Object.fromEntries(
    helpTopicIds.map((topicId) => [
      topicId,
      { ...topicMetadata[topicId], body: topicBodies[language][topicId] },
    ]),
  ) as Record<HelpTopicId, HelpTopic>;
}
