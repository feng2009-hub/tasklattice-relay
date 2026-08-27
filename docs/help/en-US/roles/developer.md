# Agent Developer guide

Build and maintain owned Agents, assemble approved capabilities, and verify observed runtime behavior before handoff.

## Build an Agent

1. **Start from the Agent Garden.** Choose a specialization or registered Agent that matches the task. Confirm its owner, supported runtime, and required capabilities. [Open Specialist Agents](/__project__/agent-garden).
2. **Assemble approved capabilities.** Select published Skills, MCP connections, Vector Databases, memory, model routing, and policies. Do not embed provider or service credentials in prompts. [Open MCP Connections](/__project__/mcp-servers).
3. **Create and observe the Instance.** Provision the runtime, follow state transitions, and use logs to separate desired configuration from observed health. [Open Runtime Instances](/__project__/instances).

## Validate before handoff

- **Test the smallest useful path.** Exercise one representative interaction, verify tool and data boundaries, and confirm that failure feedback is understandable without privileged access. [Open Instance interaction](/__project__/instances).
- **Inspect traces and logs.** Use runtime logs for provisioning and process health. Use traces to understand execution timing and model or tool behavior when your role permits it. [Open Traces](/__project__/traces).
- **Document the handoff.** Record the intended users, supported tasks, data boundary, known failure modes, and the owner who will maintain the Agent.

> **Developer scope follows ownership.** Create and change rights apply to Agents you own or maintain. Project-wide catalogs may be readable, while unrelated Agents and other users' sessions remain outside your scope. Terminal execution is reserved for administrators.
