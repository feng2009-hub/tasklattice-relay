import type { AccountLanguage } from "@/services/personal-profile";

export type SidebarNavigationGroupKey =
  | "home"
  | "capabilityToolbox"
  | "governance"
  | "evidence";

export type SidebarNavigationItemKey =
  | "instances"
  | "memory"
  | "specialistAgents"
  | "skills"
  | "mcpConnections"
  | "knowledgeSources"
  | "accessPolicies"
  | "runtimePolicies"
  | "traces"
  | "auditLogs"
  | "cost";

type SidebarMessages = {
  account: {
    account: string;
    localAccount: string;
    notifications: string;
    openMenu: (displayName: string) => string;
    signOut: string;
    ssoAccount: string;
    user: string;
  };
  brandHome: string;
  help: {
    label: string;
  };
  navigation: {
    description: string;
    groups: Record<SidebarNavigationGroupKey, string>;
    items: Record<SidebarNavigationItemKey, string>;
    title: string;
    toggle: string;
  };
  projectSwitcher: {
    currentProject: (projectName: string) => string;
    loading: string;
    newProject: string;
    noProject: string;
    projectSettings: (projectName: string) => string;
    projects: string;
    switchError: string;
  };
  search: {
    label: string;
    planned: string;
  };
  switchToast: {
    description: string;
    title: string;
  };
};

const sidebarMessages: Record<AccountLanguage, SidebarMessages> = {
  "en-US": {
    account: {
      account: "Account",
      localAccount: "Local account",
      notifications: "Notifications",
      openMenu: (displayName) => `Open account menu for ${displayName}`,
      signOut: "Sign out",
      ssoAccount: "SSO account",
      user: "User",
    },
    brandHome: "TaskLattice Relay home",
    help: {
      label: "Help & documentation",
    },
    navigation: {
      description: "Navigate TaskLattice Relay resources.",
      groups: {
        home: "Home",
        capabilityToolbox: "Capability toolbox",
        governance: "Governance",
        evidence: "Evidence",
      },
      items: {
        instances: "Instances",
        memory: "Memory",
        specialistAgents: "Specialist Agents",
        skills: "Skills",
        mcpConnections: "MCP Connections",
        knowledgeSources: "Knowledge Sources",
        accessPolicies: "Access Policies",
        runtimePolicies: "Runtime Policies",
        traces: "Traces",
        auditLogs: "Audit Logs",
        cost: "Cost",
      },
      title: "Project navigation",
      toggle: "Toggle navigation",
    },
    projectSwitcher: {
      currentProject: (projectName) =>
        `Current project: ${projectName}. Switch project`,
      loading: "Loading project",
      newProject: "New Project",
      noProject: "No project available",
      projectSettings: (projectName) => `Project settings for ${projectName}`,
      projects: "Projects",
      switchError: "Unable to switch projects.",
    },
    search: {
      label: "Search project",
      planned: "Later",
    },
    switchToast: {
      description: "Resources updated",
      title: "Project switched",
    },
  },
  "zh-CN": {
    account: {
      account: "账户",
      localAccount: "本地账户",
      notifications: "通知",
      openMenu: (displayName) => `打开 ${displayName} 的账户菜单`,
      signOut: "退出登录",
      ssoAccount: "SSO 账户",
      user: "用户",
    },
    brandHome: "TaskLattice Relay 首页",
    help: {
      label: "帮助与文档",
    },
    navigation: {
      description: "浏览 TaskLattice Relay 资源。",
      groups: {
        home: "主页",
        capabilityToolbox: "能力工具箱",
        governance: "治理",
        evidence: "运行记录",
      },
      items: {
        instances: "实例",
        memory: "记忆",
        specialistAgents: "专家智能体",
        skills: "技能",
        mcpConnections: "MCP 连接",
        knowledgeSources: "知识源",
        accessPolicies: "访问策略",
        runtimePolicies: "运行时策略",
        traces: "追踪记录",
        auditLogs: "审计日志",
        cost: "成本",
      },
      title: "项目导航",
      toggle: "切换导航栏",
    },
    projectSwitcher: {
      currentProject: (projectName) => `当前项目：${projectName}。切换项目`,
      loading: "正在加载项目",
      newProject: "新建项目",
      noProject: "没有可用项目",
      projectSettings: (projectName) => `${projectName} 的项目设置`,
      projects: "项目",
      switchError: "无法切换项目。",
    },
    search: {
      label: "搜索项目",
      planned: "计划中",
    },
    switchToast: {
      description: "资源已更新",
      title: "项目已切换",
    },
  },
};

export function getSidebarMessages(language: AccountLanguage): SidebarMessages {
  return sidebarMessages[language];
}
