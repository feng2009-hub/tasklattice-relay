import type {
  Agent,
  AgentInteractionAccess,
  AgentRuntimeLogView,
} from "@tali/contracts";

/**
 * Configuration reads must not disclose the browser endpoint. OpenClaw puts
 * its gateway bearer token in the URL fragment, so returning that URL would
 * make CONFIG_VIEW an implicit INTERACT grant.
 */
export function agentConfigurationView(agent: Agent): Agent {
  const {
    error: _runtimeError,
    httpEndpoint: sourceEndpoint,
    logs: _runtimeLogs,
    ...configuration
  } = agent;
  const httpEndpoint = sourceEndpoint
    ? (({ url: _interactionCredential, ...status }) => status)(sourceEndpoint)
    : undefined;
  return {
    ...configuration,
    // Preserve the Agent wire shape without disclosing runtime diagnostics.
    logs: [],
    ...(httpEndpoint ? { httpEndpoint } : {}),
  };
}

/** The only HTTP representation allowed to disclose an interaction URL. */
export function agentInteractionAccess(agent: Agent): AgentInteractionAccess {
  return {
    instanceId: agent.id,
    status: agent.status,
    ...(agent.httpEndpoint ? { httpEndpoint: agent.httpEndpoint } : {}),
  };
}

/**
 * Runtime output is untrusted text and may echo credentials supplied to a
 * provider or embedded in a URL. This is deliberately conservative: viewing
 * logs is useful, but a LOG_VIEW grant must never become a secret-reveal CAP.
 */
export function redactRuntimeDiagnostic(value: string): string {
  return value
    .replace(
      /(\b(?:Bearer|Basic|ApiKey)\s+)[A-Za-z0-9._~+/=-]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&#](?:access[_-]?token|api[_-]?key|authorization|credential|password|secret|token)=)[^&#\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(\b(?:access[_-]?token|api[_-]?key|authorization|client[_-]?secret|credential|password|private[_-]?key|secret|token)\b\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&#]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]");
}

export function agentRuntimeLogView(agent: Agent): AgentRuntimeLogView {
  return {
    instanceId: agent.id,
    logs: agent.logs.map(redactRuntimeDiagnostic),
    ...(agent.error ? { error: redactRuntimeDiagnostic(agent.error) } : {}),
  };
}
