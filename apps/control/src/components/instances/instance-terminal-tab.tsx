import type { Agent, TerminalTarget } from "@tasklattice/contracts";
import { AgentTerminalWorkspace } from "@/components/agents/agent-terminal-workspace";

export function InstanceTerminalTab({
  agent,
  targets,
}: {
  agent: Agent;
  targets: TerminalTarget[];
}) {
  return (
    <div role="tabpanel" aria-label="Terminal" className="pt-5">
      <AgentTerminalWorkspace
        agentId={agent.id}
        agentPlatform={agent.agentPlatform}
        targets={targets}
      />
    </div>
  );
}
