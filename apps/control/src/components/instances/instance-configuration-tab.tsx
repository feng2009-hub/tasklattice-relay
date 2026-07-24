import { useState } from "react";
import type { Agent } from "@tasklattice/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Eye, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AgentPlatformPresentation } from "@/lib/agent-platforms";
import { api } from "@/lib/api";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { DefinitionList, DetailCardHeader } from "./instance-detail-shared";
import { InstanceInstructionsDialog } from "./instance-instructions-dialog";

export function InstanceConfigurationTab({ agent, platform }: { agent: Agent; platform: AgentPlatformPresentation }) {
  const projectId = useCurrentProjectId();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(agent.virtualEmployeeId);
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: scope.key("extension-catalog"), queryFn: api.getExtensionCatalog });
  const employees = useQuery({ queryKey: scope.key("virtual-employees"), queryFn: api.listVirtualEmployees });
  const currentEmployee = employees.data?.find((item) => item.id === agent.virtualEmployeeId);
  const switchEmployee = useMutation({
    mutationFn: () => api.bindAgentVirtualEmployee(agent.id, selectedEmployeeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope.key("agent", agent.id) });
      await queryClient.invalidateQueries({ queryKey: scope.key("virtual-employees") });
    },
  });
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
        <DetailCardHeader title="Virtual Employee" description="Business identity and access are resolved by reference. Switching recreates the runtime with the new credential and is audited." />
        <CardContent className="grid gap-5 md:grid-cols-[1fr_minmax(18rem,24rem)] md:items-end">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center bg-primary/8 text-primary"><UserRoundCheck className="size-5" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><strong>{currentEmployee?.displayName ?? agent.virtualEmployeeId}</strong>{currentEmployee ? <Badge variant="outline">{currentEmployee.status}</Badge> : null}</div>
              <p className="mt-1 text-xs text-muted-foreground">{currentEmployee?.businessRole || "Bound business identity"} · {currentEmployee?.modelAccess?.allowedModels.join(", ") || agent.model}</p>
              <Link to="/$projectId/virtual-employees/$employeeId" params={{ projectId, employeeId: agent.virtualEmployeeId }} className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary hover:underline">Open Virtual Employee <ArrowUpRight className="size-3.5" /></Link>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium" htmlFor="instance-virtual-employee">Switch identity</label>
            <div className="flex gap-2">
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger id="instance-virtual-employee"><SelectValue placeholder="Select an Active Virtual Employee" /></SelectTrigger>
                <SelectContent>{(employees.data ?? []).filter((item) => item.status === "active").map((item) => <SelectItem key={item.id} value={item.id}>{item.displayName}</SelectItem>)}</SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={selectedEmployeeId === agent.virtualEmployeeId || switchEmployee.isPending}
                onClick={() => {
                  if (window.confirm("Switching Virtual Employee recreates this Instance runtime. Continue?")) switchEmployee.mutate();
                }}
              >{switchEmployee.isPending ? "Switching…" : "Switch"}</Button>
            </div>
            {switchEmployee.error ? <p role="alert" className="text-xs text-destructive">{switchEmployee.error.message}</p> : null}
          </div>
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
