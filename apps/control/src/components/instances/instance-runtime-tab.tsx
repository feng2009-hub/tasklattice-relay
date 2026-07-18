import type { Agent, RuntimeStatus } from "@tasklattice/contracts";
import { ChevronDown } from "lucide-react";
import { AgentTerminalWorkspace } from "@/components/agents/agent-terminal-workspace";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentPlatformPresentation } from "@/lib/agent-platforms";
import type { InstanceAccessState } from "./instance-detail-model";
import { endpointStatus } from "./instance-detail-model";
import { CopyableValue, DefinitionList, DetailCardHeader } from "./instance-detail-shared";

export function InstanceRuntimeTab({ access, agent, onRecheckRuntime, platform, runtime, runtimeChecking, runtimeError }: {
  access: InstanceAccessState;
  agent: Agent;
  onRecheckRuntime: () => void;
  platform: AgentPlatformPresentation;
  runtime?: RuntimeStatus;
  runtimeChecking: boolean;
  runtimeError?: string;
}) {
  return (
    <div role="tabpanel" aria-label="Runtime" className="space-y-4 pt-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <DetailCardHeader title="Runtime environment" description="Observed execution environment." />
          <CardContent><DefinitionList items={[
            { label: "Runtime", value: platform.runtimeName },
            { label: "Runtime version", value: "—" },
            { label: "Runtime image", value: "—" },
            { label: "Sandbox name", value: agent.sandboxName },
            { label: "Sandbox ID", value: <CopyableValue value={agent.sandboxName} /> },
            { label: "Region", value: "—" },
          ]} /></CardContent>
        </Card>
        <Card>
          <DetailCardHeader title="Endpoint" description="Published Agent access endpoint." />
          <CardContent><DefinitionList items={[
            { label: "Endpoint status", value: endpointStatus(agent) },
            { label: "Endpoint URL", value: <CopyableValue value={agent.httpEndpoint?.url} externalUrl={agent.httpEndpoint?.url} /> },
            { label: "Agent runtime", value: platform.name },
            { label: "Model deployment", value: agent.modelDeploymentId },
            { label: "Provider connection", value: agent.providerAccountId },
          ]} /></CardContent>
        </Card>
        <Card>
          <DetailCardHeader title="Resources" description="Runtime resource requests and limits." />
          <CardContent><DefinitionList items={[{ label: "CPU", value: "—" }, { label: "Memory", value: "—" }, { label: "GPU", value: "—" }]} /></CardContent>
        </Card>
        <Card>
          <details>
            <summary className="flex min-h-14 cursor-pointer list-none items-center px-4 font-medium focus-visible:outline-2">Advanced details <ChevronDown className="ml-auto size-4" /></summary>
            <CardContent className="border-t pt-4"><DefinitionList items={[
              { label: "Instance ID", value: <CopyableValue value={agent.id} /> },
              { label: "Operation ID", value: <CopyableValue value={agent.operationId} /> },
              { label: "Runtime phase", value: agent.runtimePhase ?? "—" },
              { label: "Cost key alias", value: <CopyableValue value={agent.costKeyAlias} /> },
            ]} /></CardContent>
          </details>
        </Card>
      </div>
      <section id="console" className="scroll-mt-24">
        {access.console.enabled ? (
          <AgentTerminalWorkspace agentId={agent.id} agentPlatform={agent.agentPlatform} runtimeStatus={runtime} runtimeError={runtimeError} runtimeChecking={runtimeChecking} onRecheckRuntime={onRecheckRuntime} />
        ) : (
          <Card><DetailCardHeader title="Console" description="Access the interactive runtime terminal." /><CardContent><p className="py-8 text-center text-sm text-muted-foreground">{access.console.disabledReason}</p></CardContent></Card>
        )}
      </section>
    </div>
  );
}
