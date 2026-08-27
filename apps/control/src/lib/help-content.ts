import adminEn from "../../../../docs/help/en-US/roles/admin.md?raw";
import reviewerEn from "../../../../docs/help/en-US/roles/reviewer.md?raw";
import auditorEn from "../../../../docs/help/en-US/roles/auditor.md?raw";
import developerEn from "../../../../docs/help/en-US/roles/developer.md?raw";
import userEn from "../../../../docs/help/en-US/roles/user.md?raw";
import maintenanceEn from "../../../../docs/help/en-US/operations/maintenance.md?raw";
import troubleshootingEn from "../../../../docs/help/en-US/operations/troubleshooting.md?raw";
import adminZh from "../../../../docs/help/zh-CN/roles/admin.md?raw";
import reviewerZh from "../../../../docs/help/zh-CN/roles/reviewer.md?raw";
import auditorZh from "../../../../docs/help/zh-CN/roles/auditor.md?raw";
import developerZh from "../../../../docs/help/zh-CN/roles/developer.md?raw";
import userZh from "../../../../docs/help/zh-CN/roles/user.md?raw";
import maintenanceZh from "../../../../docs/help/zh-CN/operations/maintenance.md?raw";
import troubleshootingZh from "../../../../docs/help/zh-CN/operations/troubleshooting.md?raw";
import adminZhTW from "../../../../docs/help/zh-TW/roles/admin.md?raw";
import reviewerZhTW from "../../../../docs/help/zh-TW/roles/reviewer.md?raw";
import auditorZhTW from "../../../../docs/help/zh-TW/roles/auditor.md?raw";
import developerZhTW from "../../../../docs/help/zh-TW/roles/developer.md?raw";
import userZhTW from "../../../../docs/help/zh-TW/roles/user.md?raw";
import maintenanceZhTW from "../../../../docs/help/zh-TW/operations/maintenance.md?raw";
import troubleshootingZhTW from "../../../../docs/help/zh-TW/operations/troubleshooting.md?raw";
import type { SupportedLanguage } from "@/i18n/config";

export const helpTopicIds = [
  "admin",
  "developer",
  "reviewer",
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
  "/$projectId/vector-databases",
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
  reviewer: { category: "role", id: "reviewer", preview: true },
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
    reviewer: reviewerEn,
    auditor: auditorEn,
    developer: developerEn,
    maintenance: maintenanceEn,
    troubleshooting: troubleshootingEn,
    user: userEn,
  },
  "zh-CN": {
    admin: adminZh,
    reviewer: reviewerZh,
    auditor: auditorZh,
    developer: developerZh,
    maintenance: maintenanceZh,
    troubleshooting: troubleshootingZh,
    user: userZh,
  },
  "zh-TW": {
    admin: adminZhTW,
    reviewer: reviewerZhTW,
    auditor: auditorZhTW,
    developer: developerZhTW,
    maintenance: maintenanceZhTW,
    troubleshooting: troubleshootingZhTW,
    user: userZhTW,
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
