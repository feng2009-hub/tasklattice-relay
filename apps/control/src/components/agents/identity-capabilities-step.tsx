import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpenText, Plus } from "lucide-react";
import type { McpServerPreview, SkillPreview } from "@/lib/preview-data";
import { knowledgeSourcePreviews, mcpServerPreviews, skillPreviews } from "@/lib/preview-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Textarea } from "@/components/ui/textarea";
import { CapabilityMultiSelect } from "./capability-multi-select";
import type { Specialization, SpecializationId } from "./specializations";
import { SpecializationSelector, SpecializationSummary } from "./specialization-selector";
import { SystemPromptViewer } from "./system-prompt-viewer";

function skillOption(skill: SkillPreview): MultiSelectOption {
  return {
    value: skill.id,
    label: skill.name,
    description: skill.description,
    meta: `${skill.category} · v${skill.version}`,
  };
}

function mcpStatus(server: McpServerPreview): string {
  if (server.status === "HEALTHY") return "Connected";
  if (server.status === "PERMISSION_REQUIRED") return "Permission required";
  if (server.status === "UNAVAILABLE") return "Unavailable";
  return "Not connected";
}

function mcpStatusTone(server: McpServerPreview): "danger" | "neutral" | "success" | "warning" {
  if (server.status === "HEALTHY") return "success";
  if (server.status === "PERMISSION_REQUIRED") return "warning";
  if (server.status === "UNAVAILABLE") return "danger";
  return "neutral";
}

const skillOptions = skillPreviews.filter((skill) => skill.status === "PUBLISHED").map(skillOption);
const mcpOptions: MultiSelectOption[] = mcpServerPreviews.map((server) => ({
  value: server.id,
  label: server.name,
  description: `${server.transport} · ${server.tools} tools`,
  meta: mcpStatus(server),
  metaTone: mcpStatusTone(server),
  disabled: server.status === "UNAVAILABLE",
}));

export function IdentityCapabilitiesStep({ customSystemPrompt, name, onCustomSystemPromptChange, onMcpServerIdsChange, onNameChange, onSkillIdsChange, onSpecializationChange, selectedKnowledgeSourceIds, selectedMcpServerIds, selectedSkillIds, specialization }: {
  customSystemPrompt: string;
  name: string;
  onCustomSystemPromptChange: (value: string) => void;
  onMcpServerIdsChange: (ids: string[]) => void;
  onNameChange: (value: string) => void;
  onSkillIdsChange: (ids: string[]) => void;
  onSpecializationChange: (id: SpecializationId) => void;
  selectedKnowledgeSourceIds: readonly string[];
  selectedMcpServerIds: readonly string[];
  selectedSkillIds: readonly string[];
  specialization: Specialization;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const incompleteMcpServers = selectedMcpServerIds
    .map((id) => mcpServerPreviews.find((item) => item.id === id))
    .filter((item): item is McpServerPreview => Boolean(item && item.status !== "HEALTHY"));
  const selectedKnowledgeSources = selectedKnowledgeSourceIds
    .map((id) => knowledgeSourcePreviews.find((item) => item.id === id))
    .filter((item): item is (typeof knowledgeSourcePreviews)[number] => Boolean(item));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b"><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="agent-name">Agent name</Label>
            <div className="relative">
              <Input id="agent-name" required maxLength={64} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="hr-assistant" className="pr-16" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{name.length}/64</span>
            </div>
            {name.length > 0 && name.trim().length < 3 ? <p role="alert" className="text-xs text-destructive">Use at least 3 characters.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b"><CardTitle>Specialization</CardTitle></CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(17rem,.8fr)_minmax(0,1.2fr)]">
          <SpecializationSelector value={specialization} onChange={onSpecializationChange} />
          <div className="lg:border-l lg:pl-6">
            {specialization.id === "custom" ? (
              <div className="space-y-2">
                <Label htmlFor="custom-system-prompt">System instructions</Label>
                <Textarea id="custom-system-prompt" rows={7} maxLength={8000} value={customSystemPrompt} onChange={(event) => onCustomSystemPromptChange(event.target.value)} placeholder="Define how this Agent should behave, what evidence it should use, and when it should escalate." />
                <div className="flex items-center justify-between gap-3 text-xs"><span className={customSystemPrompt.trim().length < 10 ? "text-destructive" : "text-muted-foreground"}>Custom instructions require at least 10 characters.</span><span className="text-muted-foreground">{customSystemPrompt.length}/8000</span></div>
              </div>
            ) : (
              <SpecializationSummary
                specialization={specialization}
                skillCount={selectedSkillIds.length}
                mcpCount={selectedMcpServerIds.length}
                knowledgeCount={selectedKnowledgeSourceIds.length}
                onViewPrompt={() => setPromptOpen(true)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <CardTitle>Capabilities</CardTitle>
              <p className="text-xs text-muted-foreground">{specialization.id === "custom" || specialization.id === "general-purpose" ? "Add Skills or MCP Servers to customize this Agent." : `Preselected by the ${specialization.name} specialization — you can remove or add items.`}</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/mcp"><Plus /> Add MCP server</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <CapabilityMultiSelect
              id="agent-skills"
              label="Skills"
              description="Reusable capability packages available to this Agent."
              ariaLabel="Select Skills"
              options={skillOptions}
              selectedIds={selectedSkillIds}
              onChange={onSkillIdsChange}
              placeholder="Select one or more Skills…"
            />
            <CapabilityMultiSelect
              id="agent-mcp-servers"
              label="MCP Servers"
              description="Connected tools and external systems available to this Agent."
              ariaLabel="Select MCP Servers"
              options={mcpOptions}
              selectedIds={selectedMcpServerIds}
              onChange={onMcpServerIdsChange}
              placeholder="Select one or more MCP Servers…"
              warning={incompleteMcpServers.length ? `${incompleteMcpServers.map((item) => item.name).join(", ")} ${incompleteMcpServers.length === 1 ? "requires" : "require"} connection or access before this Instance is ready.` : undefined}
              warningAction={incompleteMcpServers.length ? <Button asChild variant="link" size="sm" className="h-auto min-h-0 p-0 text-amber-900 dark:text-amber-100"><Link to="/mcp">Connect or request access</Link></Button> : undefined}
            />
          </div>
          {!selectedSkillIds.length && !selectedMcpServerIds.length && !selectedKnowledgeSourceIds.length ? <div className="rounded-md border border-dashed px-4 py-5 text-center"><strong className="text-sm">No capabilities selected.</strong><p className="mt-1 text-xs text-muted-foreground">Add Skills or MCP Servers to customize this Agent.</p></div> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <BookOpenText className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0"><strong className="block text-xs">Knowledge</strong><span className="mt-0.5 block truncate text-xs text-muted-foreground">{selectedKnowledgeSources.length ? selectedKnowledgeSources.map((item) => item.name).join(", ") : "No knowledge sources selected."}</span></div>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{selectedKnowledgeSources.length} {selectedKnowledgeSources.length === 1 ? "source" : "sources"}</span>
          </div>
        </CardContent>
      </Card>

      {specialization.id !== "custom" ? <SystemPromptViewer open={promptOpen} onOpenChange={setPromptOpen} specializationName={specialization.name} prompt={specialization.systemPrompt} /> : null}
    </div>
  );
}
