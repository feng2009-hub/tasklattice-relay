import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";

const enabledOidcSchema = z.object({
  enabled: z.literal(true),
  display_name: z.string().trim().min(1).default("SSO"),
  issuer: z.string().url(),
  client_id: z.string().trim().min(1),
  client_secret: z.string().default(""),
});

const disabledOidcSchema = z.object({
  enabled: z.literal(false),
  display_name: z.string().trim().min(1).default("SSO"),
  issuer: z.string().default(""),
  client_id: z.string().default(""),
  client_secret: z.string().default(""),
});

const disabledSmtpConfig = {
  enabled: false as const,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  from_address: "",
  from_name: "TaskLattice Relay",
  reply_to: "",
};

const defaultRuntimeNamespacesConfig = {
  enabled: false,
  cluster_id: "in-cluster",
  name_prefix: "tali-p",
  deletion_timeout_seconds: 120,
};

const runtimeNamespacesConfigSchema = z.object({
  enabled: z.boolean(),
  cluster_id: z.string().trim().min(1).max(120),
  name_prefix: z.string().trim().min(1).max(20).regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "runtime_namespaces.name_prefix must be a DNS label prefix.",
  ),
  deletion_timeout_seconds: z.number().int().min(10).max(1_800),
});

const smtpConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim(),
  port: z.number().int().min(1).max(65_535),
  secure: z.boolean(),
  username: z.string(),
  password: z.string(),
  from_address: z.string().trim(),
  from_name: z.string().trim().min(1),
  reply_to: z.string().trim(),
}).superRefine((value, context) => {
  if (!value.enabled) return;
  if (!value.host) {
    context.addIssue({
      code: "custom",
      path: ["host"],
      message: "smtp.host is required when SMTP invitations are enabled.",
    });
  }
  if (!z.email().safeParse(value.from_address).success) {
    context.addIssue({
      code: "custom",
      path: ["from_address"],
      message: "smtp.from_address must be a valid email address.",
    });
  }
  if (value.reply_to && !z.email().safeParse(value.reply_to).success) {
    context.addIssue({
      code: "custom",
      path: ["reply_to"],
      message: "smtp.reply_to must be a valid email address when configured.",
    });
  }
  if (Boolean(value.username) !== Boolean(value.password)) {
    context.addIssue({
      code: "custom",
      path: [value.username ? "password" : "username"],
      message: "smtp.username and smtp.password must be configured together.",
    });
  }
});

const localAuthConfigSchema = z.object({
  enabled: z.boolean(),
  initial_platform_administrator_username: z.string().trim().min(1).optional(),
  initial_platform_administrator_email: z.string().email().optional(),
  initial_platform_administrator_password: z.string().min(1).max(128).optional(),
  // Accepted during the terminology migration so existing sealed TOML files
  // continue to boot. New generated configuration only emits the canonical
  // Platform Administrator keys.
  initial_super_admin_username: z.string().trim().min(1).optional(),
  initial_super_admin_email: z.string().email().optional(),
  initial_super_admin_password: z.string().min(1).max(128).optional(),
}).superRefine((value, context) => {
  const canonical = [
    value.initial_platform_administrator_username,
    value.initial_platform_administrator_email,
    value.initial_platform_administrator_password,
  ].filter(Boolean).length;
  const legacy = [
    value.initial_super_admin_username,
    value.initial_super_admin_email,
    value.initial_super_admin_password,
  ].filter(Boolean).length;
  if (canonical !== 0 && canonical !== 3) {
    context.addIssue({
      code: "custom",
      message:
        "initial_platform_administrator_username, initial_platform_administrator_email, and initial_platform_administrator_password must be configured together.",
    });
  }
  if (legacy !== 0 && legacy !== 3) {
    context.addIssue({
      code: "custom",
      message:
        "Legacy initial administrator username, email, and password values must be configured together.",
    });
  }
}).transform((value) => ({
  enabled: value.enabled,
  initial_platform_administrator_username:
    value.initial_platform_administrator_username
    ?? value.initial_super_admin_username,
  initial_platform_administrator_email:
    value.initial_platform_administrator_email
    ?? value.initial_super_admin_email,
  initial_platform_administrator_password:
    value.initial_platform_administrator_password
    ?? value.initial_super_admin_password,
}));

const controlConfigSchema = z.object({
  schema_version: z.literal(1),
  server: z.object({
    public_url: z.string().url().optional(),
    internal_url: z.string().url().optional(),
  }),
  database: z.object({
    url: z.string().trim().min(1),
  }),
  auth: z.object({
    secret: z.string().min(32),
    local: localAuthConfigSchema,
    oidc: z.discriminatedUnion("enabled", [
      enabledOidcSchema,
      disabledOidcSchema,
    ]),
  }).superRefine((value, context) => {
    if (!value.local.enabled && !value.oidc.enabled) {
      context.addIssue({
        code: "custom",
        message: "At least one authentication provider must be enabled.",
      });
    }
    if (
      value.local.enabled &&
      (!value.local.initial_platform_administrator_username ||
        !value.local.initial_platform_administrator_email ||
        !value.local.initial_platform_administrator_password)
    ) {
      context.addIssue({
        code: "custom",
        path: ["local"],
        message:
          "Local authentication requires the initial Platform Administrator username, email, and password.",
      });
    }
  }),
  runner: z.object({
    url: z.string().url(),
    token: z.string().min(1),
  }),
  litellm: z.object({
    url: z.string().url(),
    master_key: z.string(),
  }),
  runtime_namespaces: runtimeNamespacesConfigSchema.default(
    defaultRuntimeNamespacesConfig,
  ),
  smtp: smtpConfigSchema.default(disabledSmtpConfig),
}).superRefine((value, context) => {
  if (!value.server.public_url) {
    context.addIssue({
      code: "custom",
      path: ["server", "public_url"],
      message: "server.public_url is required for Better Auth.",
    });
  }
  if (value.smtp.enabled && !value.server.public_url) {
    context.addIssue({
      code: "custom",
      path: ["server", "public_url"],
      message: "server.public_url is required when SMTP invitations are enabled.",
    });
  }
});

export type ControlConfig = z.infer<typeof controlConfigSchema>;

declare global {
  var taliControlConfig: ControlConfig | undefined;
}

const developmentConfig: ControlConfig = {
  schema_version: 1,
  server: {
    public_url: "http://127.0.0.1:8080",
  },
  database: {
    url: "postgresql://tali:development@127.0.0.1:5432/tali",
  },
  auth: {
    secret: "tali-local-development-secret-32-chars",
    local: {
      enabled: true,
      initial_platform_administrator_username: "admin",
      initial_platform_administrator_email: "admin@tasklattice.local",
      initial_platform_administrator_password: "admin",
    },
    oidc: {
      enabled: false,
      display_name: "SSO",
      issuer: "",
      client_id: "",
      client_secret: "",
    },
  },
  runner: {
    url: "http://127.0.0.1:9090",
    token: "local-dev-token",
  },
  litellm: {
    url: "http://127.0.0.1:4000",
    master_key: "",
  },
  runtime_namespaces: defaultRuntimeNamespacesConfig,
  smtp: disabledSmtpConfig,
};

export function getControlConfig(): ControlConfig {
  if (globalThis.taliControlConfig) {
    return globalThis.taliControlConfig;
  }
  const configuredPath = process.env.TALI_CONFIG;
  if (!configuredPath) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TALI_CONFIG must point to the Control Plane TOML file in production.",
      );
    }
    globalThis.taliControlConfig = developmentConfig;
    return developmentConfig;
  }
  const path = resolve(configuredPath);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read TaskLattice Relay configuration at ${path}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  const result = controlConfigSchema.safeParse(parse(raw));
  if (!result.success) {
    throw new Error(
      `Invalid TaskLattice Relay configuration at ${path}: ${z.prettifyError(result.error)}`,
    );
  }
  globalThis.taliControlConfig = result.data;
  return result.data;
}

export function setControlConfigForTests(
  config: ControlConfig | undefined,
): void {
  globalThis.taliControlConfig = config;
}

export function developmentControlConfig(): ControlConfig {
  return structuredClone(developmentConfig);
}
