import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const endpoint = process.env.TALI_RUN_TELEMETRY_ENDPOINT ?? "";
const token = process.env.TALI_RUN_TELEMETRY_TOKEN ?? "";
const startedAt = new Map();

async function report(payload) {
  if (!endpoint || !token) return;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      throw new Error(`Run telemetry returned HTTP ${response.status}`);
    }
  } catch (error) {
    // Telemetry is observational and must not break or block an Agent Run.
    console.warn(`[tali-run-telemetry] ${error instanceof Error ? error.message : "delivery failed"}`);
  }
}

function terminalStatus(success, error) {
  if (success) return { status: "SUCCEEDED", terminalReason: "COMPLETED" };
  const value = String(error ?? "").toLowerCase();
  if (/timeout|timed out/.test(value)) {
    return { status: "TIMED_OUT", terminalReason: "TIMEOUT", errorCategory: "RUNTIME_TIMEOUT" };
  }
  if (/cancel|abort|killed|stopped/.test(value)) {
    return { status: "CANCELLED", terminalReason: "CANCELLED", errorCategory: "RUNTIME_CANCELLED" };
  }
  if (/block|denied|policy/.test(value)) {
    return { status: "BLOCKED", terminalReason: "POLICY_BLOCKED", errorCategory: "POLICY_BLOCKED" };
  }
  return { status: "FAILED", terminalReason: "RUNTIME_ERROR", errorCategory: "RUNTIME_ERROR" };
}

export default definePluginEntry({
  id: "tali-run-telemetry",
  name: "TaskLattice Run Telemetry",
  description: "Reports sanitized top-level Run lifecycle events to TaskLattice Relay.",
  register(api) {
    api.on("before_agent_run", async (_event, context) => {
      if (!context.runId) return;
      const now = Date.now();
      startedAt.set(context.runId, now);
      await report({
        event: "started",
        runId: context.runId,
        occurredAt: new Date(now).toISOString(),
        triggerType: context.jobId ? "SCHEDULED" : "USER",
        ...(context.trace?.traceId ? { traceId: context.trace.traceId } : {}),
      });
    });

    api.on("agent_end", async (event, context) => {
      const runId = event.runId ?? context.runId;
      if (!runId) return;
      const now = Date.now();
      const observedStart = startedAt.get(runId);
      startedAt.delete(runId);
      await report({
        event: "finished",
        runId,
        occurredAt: new Date(now).toISOString(),
        ...terminalStatus(event.success, event.error),
        durationMs: event.durationMs ?? (observedStart ? now - observedStart : undefined),
        ...(context.trace?.traceId ? { traceId: context.trace.traceId } : {}),
      });
    });
  },
});
