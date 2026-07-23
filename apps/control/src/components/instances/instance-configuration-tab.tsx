import { useState } from "react";
import type { Agent } from "@tasklattice/contracts";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentPlatformPresentation } from "@/lib/agent-platforms";
import { api } from "@/lib/api";
import { DefinitionList, DetailCardHeader } from "./instance-detail-shared";
import { InstanceInstructionsDialog } from "./instance-instructions-dialog";

export function InstanceConfigurationTab({ agent, platform }: { agent: Agent; platform: AgentPlatformPresentation }) {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const catalog = useQuery({ queryKey: ["extension-catalog"], queryFn: api.getExtensionCatalog });
  const role = catalog.data?.specializations.find((item) => item.id === agent.specializationId);
  const managedBy = role?.name ?? (agent.specializationId ? agent.specializationId : "Custom");
  return (
    <div role="tabpanel" aria-label="Configuration" className="grid gap-4 pt-5 lg:grid-cols-2">
      <Card>
        <DetailCardHeader title="Identity" description="Identity captured when this Instance was created." />
        <CardContent><DefinitionList items={[
          { label: "Agent name", value: agent.name },
          { label: "Description", value: agent.description || "—" },
          { label: "Role", value: managedBy },
        ]} /></CardContent>
      </Card>
      <Card>
        <DetailCardHeader title="Instructions" description={agent.specializationId === "custom" ? "Custom instructions" : `Instructions managed by ${managedBy}`} />
        <CardContent className="flex min-h-36 flex-col items-start justify-between gap-4">
          <p className="line-clamp-3 text-xs leading-6 text-muted-foreground">{agent.systemPrompt || "Instruction content is unavailable."}</p>
          <Button type="button" variant="outline" disabled={!agent.systemPrompt} onClick={() => setInstructionsOpen(true)}><Eye />View instructions</Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <DetailCardHeader title="Managed inference" description="TaskLattice resolved this access contract automatically when the Instance was created." />
        <CardContent><DefinitionList columns={2} items={[
          { label: "Inference mode", value: "Platform managed" },
          { label: "Inference status", value: agent.modelProfileStatus?.replaceAll("_", " ") ?? "Unavailable" },
          { label: "Compliance", value: agent.modelProfileComplianceDomain === "CN_MAINLAND" ? "CN Mainland" : "Global" },
          { label: "Automatic routing", value: agent.modelProfileCapabilities?.automaticRouting === "ENABLED" ? "Enabled" : "Not enabled" },
          { label: "Failover", value: agent.modelProfileCapabilities?.failover === "ENABLED" ? "Enabled" : "Not enabled" },
          { label: "Key fingerprint", value: agent.modelProfileKeyFingerprint ?? "Unavailable" },
          { label: "Agent framework", value: platform.name },
          { label: "Runtime", value: platform.runtimeName },
        ]} /></CardContent>
      </Card>
      <InstanceInstructionsDialog managedBy={managedBy} prompt={agent.systemPrompt} open={instructionsOpen} onOpenChange={setInstructionsOpen} />
    </div>
  );
}
