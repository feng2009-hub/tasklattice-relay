import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { KnowledgeSourceDefinition, McpServerDefinition, SkillDefinition } from "@tasklattice/contracts";
import { BookOpenText, Boxes, ChevronDown, Eye, Info, Network, Plus, ServerCog, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SpecializationIcon } from "./specialization-selector";
import type { Specialization, SpecializationId } from "./specializations";
import { SystemPromptViewer } from "./system-prompt-viewer";

function skillOption(skill: SkillDefinition): MultiSelectOption {
  return {
    value: skill.id,
    label: skill.name,
    description: skill.description,
    meta: `${skill.category} · v${skill.version}`,
  };
}

function mcpStatus(server: McpServerDefinition): string {
  if (server.status === "HEALTHY") return "Connected";
  if (server.status === "PERMISSION_REQUIRED") return "Permission required";
  if (server.status === "UNAVAILABLE") return "Unavailable";
  return "Not connected";
}

function mcpStatusTone(server: McpServerDefinition): "danger" | "neutral" | "success" | "warning" {
  if (server.status === "HEALTHY") return "success";
  if (server.status === "PERMISSION_REQUIRED") return "warning";
  if (server.status === "UNAVAILABLE") return "danger";
  return "neutral";
}

export function IdentityCapabilitiesStep({ customSystemPrompt, knowledgeSources, mcpServers, name, onCustomSystemPromptChange, onKnowledgeSourceIdsChange, onMcpServerIdsChange, onNameChange, onSkillIdsChange, onSpecializationChange, selectedKnowledgeSourceIds, selectedMcpServerIds, selectedSkillIds, skills, specialization, specializations }: {
  customSystemPrompt: string;
  knowledgeSources: readonly KnowledgeSourceDefinition[];
  mcpServers: readonly McpServerDefinition[];
  name: string;
  onCustomSystemPromptChange: (value: string) => void;
  onKnowledgeSourceIdsChange: (ids: string[]) => void;
  onMcpServerIdsChange: (ids: string[]) => void;
  onNameChange: (value: string) => void;
  onSkillIdsChange: (ids: string[]) => void;
  onSpecializationChange: (id: SpecializationId) => void;
  selectedKnowledgeSourceIds: readonly string[];
  selectedMcpServerIds: readonly string[];
  selectedSkillIds: readonly string[];
  skills: readonly SkillDefinition[];
  specialization: Specialization;
  specializations: readonly Specialization[];
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const skillOptions = skills.filter((skill) => skill.status === "PUBLISHED").map(skillOption);
  const mcpOptions: MultiSelectOption[] = mcpServers.map((server) => ({
    value: server.id,
    label: server.name,
    description: `${server.transport} · ${server.tools} tools`,
    meta: mcpStatus(server),
    metaTone: mcpStatusTone(server),
    disabled: server.status === "UNAVAILABLE",
  }));
  const knowledgeOptions: MultiSelectOption[] = knowledgeSources.map((source) => ({
    value: source.id,
    label: source.name,
    description: source.description,
    meta: source.status === "READY" ? "Ready" : "Not checked",
    metaTone: source.status === "READY" ? "success" : "neutral",
  }));
  const incompleteMcpServers = selectedMcpServerIds
    .map((id) => mcpServers.find((item) => item.id === id))
    .filter((item): item is McpServerDefinition => Boolean(item && item.status !== "HEALTHY"));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b"><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(20rem,.72fr)] md:grid-rows-[auto_3rem_auto]">
            <Label htmlFor="agent-name" className="md:col-start-1 md:row-start-1">Agent name</Label>
            <div className="relative md:col-start-1 md:row-start-2">
              <Input id="agent-name" required maxLength={64} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="hr-assistant" className="h-12 pr-16" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{name.length}/64</span>
            </div>
            {name.length > 0 && name.trim().length < 3 ? <p role="alert" className="text-xs text-destructive md:col-start-1 md:row-start-3">Use at least 3 characters.</p> : null}
            <span className="hidden h-12 items-center text-sm font-medium text-muted-foreground md:col-start-2 md:row-start-2 md:flex">as</span>
            <Label htmlFor="agent-role" className="md:col-start-3 md:row-start-1">Role</Label>
            <div className="md:col-start-3 md:row-start-2">
              <Select value={specialization.id} onValueChange={(id) => onSpecializationChange(id as SpecializationId)}>
                <SelectTrigger id="agent-role" className="w-full data-[size=default]:h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {specializations.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="py-2.5">
                      <span className="flex items-center gap-2"><SpecializationIcon specialization={item} /><span>{item.roleLabel}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {specialization.id === "custom" ? (
            <div className="space-y-2 border-t pt-5">
              <Label htmlFor="custom-system-prompt">System instructions</Label>
              <Textarea id="custom-system-prompt" rows={5} maxLength={8000} value={customSystemPrompt} onChange={(event) => onCustomSystemPromptChange(event.target.value)} placeholder="Define how this Agent should behave, what evidence it should use, and when it should escalate." />
              <div className="flex items-center justify-between gap-3 text-xs"><span className={customSystemPrompt.trim().length < 10 ? "text-destructive" : "text-muted-foreground"}>Custom instructions require at least 10 characters.</span><span className="text-muted-foreground">{customSystemPrompt.length}/8000</span></div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" />Selecting a role applies its instructions and recommended capabilities.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setPromptOpen(true)}><Eye /> View instructions</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <CardTitle>Capabilities</CardTitle>
              <p className="text-xs text-muted-foreground">{specialization.id === "general-purpose" || specialization.id === "custom" ? "Add the tools and knowledge this Agent can use." : `Preselected by the ${specialization.roleLabel} role. You can add or remove any item.`}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><Plus /> Edit Capability <ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSkillsOpen(true)}><Boxes /> Skills</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setMcpOpen(true)}><ServerCog /> MCP Servers</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setKnowledgeOpen(true)}><BookOpenText /> Knowledge Bases</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CapabilityRow
            icon={<Boxes className="size-4" />}
            title="Skills"
            description="Reusable capability packages available to this Agent."
            open={skillsOpen}
            onOpenChange={setSkillsOpen}
            options={skillOptions}
            selectedIds={selectedSkillIds}
            onChange={onSkillIdsChange}
          />
          <CapabilityRow
            icon={<ServerCog className="size-4" />}
            title="MCP Servers"
            description="Connected tools and external systems available to this Agent."
            open={mcpOpen}
            onOpenChange={setMcpOpen}
            options={mcpOptions}
            selectedIds={selectedMcpServerIds}
            onChange={onMcpServerIdsChange}
            footer={incompleteMcpServers.length ? <p role="alert" className="flex flex-wrap items-center gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"><Info className="size-4" />{incompleteMcpServers.map((item) => item.name).join(", ")} requires connection or access before this Instance is ready. <Button asChild variant="link" size="sm" className="h-auto min-h-0 p-0 text-current"><Link to="/mcp">Connect or request access</Link></Button></p> : undefined}
          />
          <CapabilityRow
            icon={<Network className="size-4" />}
            title="Knowledge Bases"
            description="Approved sources the Agent can search for grounded answers."
            open={knowledgeOpen}
            onOpenChange={setKnowledgeOpen}
            options={knowledgeOptions}
            selectedIds={selectedKnowledgeSourceIds}
            onChange={onKnowledgeSourceIdsChange}
          />
        </CardContent>
      </Card>

      {specialization.id !== "custom" ? <SystemPromptViewer open={promptOpen} onOpenChange={setPromptOpen} specializationName={specialization.roleLabel} prompt={specialization.systemPrompt} /> : null}
    </div>
  );
}

function CapabilityRow({ description, footer, icon, onChange, onOpenChange, open, options, selectedIds, title }: {
  description: string;
  footer?: ReactNode;
  icon: ReactNode;
  onChange: (ids: string[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  options: readonly MultiSelectOption[];
  selectedIds: readonly string[];
  title: string;
}) {
  const selected = selectedIds.map((id) => options.find((option) => option.value === id)).filter((option): option is MultiSelectOption => Boolean(option));
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-md border">
      <div className="flex min-h-20 items-start gap-3 px-4 py-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{title}</h3><Badge variant="outline" className="font-normal">{selectedIds.length} selected</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {selected.length ? <div className="mt-2 flex flex-wrap gap-2">{selected.map((option) => <button key={option.value} type="button" className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/15" onClick={() => onChange(selectedIds.filter((id) => id !== option.value))}>{option.label}<X className="size-3" /><span className="sr-only">Remove</span></button>)}</div> : <p className="mt-2 text-xs text-muted-foreground">None selected</p>}
        </div>
        <CollapsibleTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={`${open ? "Collapse" : "Expand"} ${title}`}><ChevronDown className={cn("transition-transform", open && "rotate-180")} /></Button></CollapsibleTrigger>
      </div>
      <CollapsibleContent className="border-t bg-muted/10 p-4">
        <MultiSelectCombobox ariaLabel={`Select ${title}`} emptyMessage={`No ${title.toLowerCase()} match`} onValueChange={onChange} options={options} placeholder={`Select ${title.toLowerCase()}…`} searchPlaceholder={`Search ${title.toLowerCase()}…`} value={selectedIds} />
        {footer ? <div className="mt-3">{footer}</div> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
