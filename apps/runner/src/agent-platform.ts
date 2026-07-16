import type {
  AgentPlatformId,
  HttpEndpoint,
} from "@tasklattice/contracts";

export interface AgentPlatformRuntime {
  id: AgentPlatformId;
  instructionsPath: string;
  terminalCommand: string;
  endpointKind: HttpEndpoint["kind"];
  sandboxImage: () => string;
  bootstrapScript: (dashboardOrigin: string, dashboardPort: string) => string;
  healthProbe: (dashboardPort: string) => string;
  startupLogs: readonly string[];
}

const openClawBootstrapScript = (
  dashboardOrigin: string,
  dashboardPort: string,
) => `#!/usr/bin/env bash
set -euo pipefail

readonly config_file=/sandbox/.openclaw/openclaw.json
readonly hash_file=/sandbox/.openclaw/.config-hash

node - "$config_file" "${dashboardOrigin}" <<'NODE'
const fs = require("node:fs");
const [configFile, corsOrigin] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
const controlUi = (config.gateway ??= {}).controlUi ??= {};
const origins = Array.isArray(controlUi.allowedOrigins)
  ? controlUi.allowedOrigins
  : [];
controlUi.allowedOrigins = [...new Set([...origins, corsOrigin])];
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\\n", {
  mode: 0o660,
});
NODE

(cd "$(dirname "$config_file")" && sha256sum "$(basename "$config_file")" >"$hash_file")
exec env "NEMOCLAW_DASHBOARD_PORT=${dashboardPort}" /usr/local/bin/nemoclaw-start
`;

const hermesBootstrapScript = (
  _dashboardOrigin: string,
  dashboardPort: string,
) => `#!/usr/bin/env bash
set -euo pipefail

exec env "NEMOCLAW_DASHBOARD_PORT=${dashboardPort}" /usr/local/bin/nemoclaw-start
`;

const agentPlatformRuntimeRegistry = {
  openclaw: {
    id: "openclaw",
    instructionsPath: "/sandbox/.openclaw/workspace/AGENTS.md",
    terminalCommand: "exec openclaw tui",
    endpointKind: "openclaw-webui",
    sandboxImage: () =>
      process.env.OPENSHELL_SANDBOX_IMAGE ??
      "tasklattice-nemoclaw-sandbox:0.3.0",
    bootstrapScript: openClawBootstrapScript,
    healthProbe: (dashboardPort) =>
      `test -x /usr/local/bin/nemoclaw-start && test -f /sandbox/.openclaw/openclaw.json && curl -fsS --max-time 3 http://127.0.0.1:${dashboardPort}/health >/dev/null`,
    startupLogs: [
      "OpenClaw Agent instructions uploaded to the sandbox workspace.",
      "NemoClaw supervisor started the OpenClaw Agent gateway.",
      "OpenClaw gateway health check: Ready",
    ],
  },
  hermes: {
    id: "hermes",
    instructionsPath: "/sandbox/.hermes/SOUL.md",
    terminalCommand: "exec hermes --tui",
    endpointKind: "hermes-dashboard",
    sandboxImage: () =>
      process.env.OPENSHELL_HERMES_SANDBOX_IMAGE ??
      "tasklattice-nemoclaw-hermes-sandbox:0.3.0",
    bootstrapScript: hermesBootstrapScript,
    healthProbe: () =>
      "test -x /usr/local/bin/hermes && test -f /sandbox/.hermes/config.yaml && curl -fsS --max-time 3 http://127.0.0.1:8642/health >/dev/null",
    startupLogs: [
      "Hermes Agent instructions uploaded to the sandbox state directory.",
      "NemoClaw supervisor started the Hermes gateway.",
      "Hermes API health check: Ready",
    ],
  },
} as const satisfies Record<AgentPlatformId, AgentPlatformRuntime>;

export function getAgentPlatformRuntime(
  agentPlatform: AgentPlatformId,
): AgentPlatformRuntime {
  return agentPlatformRuntimeRegistry[agentPlatform];
}
