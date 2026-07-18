import type { Agent } from "@tasklattice/contracts";
import { BookOpen, Network, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { knowledgeSourcePreviews, mcpServerPreviews, skillPreviews } from "@/lib/preview-data";
import { cn } from "@/lib/utils";
import { DetailCardHeader } from "./instance-detail-shared";

function EmptyCapability({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">No {label} configured</p>;
}

export function InstanceCapabilitiesTab({ agent }: { agent: Agent }) {
  const skills = (agent.skillIds ?? []).map((id) => skillPreviews.find((item) => item.id === id) ?? { id, name: id, description: "Catalog details unavailable.", version: undefined });
  const mcpServers = (agent.mcpServerIds ?? []).map((id) => mcpServerPreviews.find((item) => item.id === id) ?? { id, name: id, status: "UNCHECKED" as const, tools: undefined, transport: undefined });
  const knowledgeBases = (agent.knowledgeSourceIds ?? []).map((id) => knowledgeSourcePreviews.find((item) => item.id === id) ?? { id, name: id, description: "Catalog details unavailable.", mode: undefined });
  return (
    <div role="tabpanel" aria-label="Capabilities" className="grid gap-4 pt-5 xl:grid-cols-3">
      <Card id="skills" className="scroll-mt-24">
        <DetailCardHeader title="Skills" description="Reusable capability packages configured for this Agent." action={<Sparkles className="size-5 text-primary" />} />
        <CardContent className="divide-y">
          {skills.length ? skills.map((skill) => (
            <article key={skill.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium">{skill.name}</h3>{skill.version ? <Badge variant="secondary">v{skill.version}</Badge> : null}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{skill.description}</p>
            </article>
          )) : <EmptyCapability label="Skills" />}
        </CardContent>
      </Card>

      <Card id="mcp-servers" className="scroll-mt-24">
        <DetailCardHeader title="MCP Servers" description="Connected tools and external systems." action={<Network className="size-5 text-primary" />} />
        <CardContent className="divide-y">
          {mcpServers.length ? mcpServers.map((server) => {
            const connected = server.status === "HEALTHY";
            return (
              <article key={server.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium">{server.name}</h3><Badge variant="outline" className={cn("border-transparent", connected ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}><span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground")} />{connected ? "Connected" : server.status === "UNAVAILABLE" ? "Unavailable" : "Disconnected"}</Badge></div>
                <p className="mt-2 text-xs text-muted-foreground">{server.transport ?? "Transport unavailable"}{typeof server.tools === "number" ? ` · ${server.tools} tools` : ""}</p>
              </article>
            );
          }) : <EmptyCapability label="MCP Servers" />}
        </CardContent>
      </Card>

      <Card id="knowledge-bases" className="scroll-mt-24">
        <DetailCardHeader title="Knowledge Bases" description="Approved sources used for grounded answers." action={<BookOpen className="size-5 text-primary" />} />
        <CardContent className="divide-y">
          {knowledgeBases.length ? knowledgeBases.map((source) => (
            <article key={source.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium">{source.name}</h3>{source.mode ? <Badge variant="secondary">{source.mode}</Badge> : null}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{source.description}</p>
            </article>
          )) : <EmptyCapability label="Knowledge Bases" />}
        </CardContent>
      </Card>
    </div>
  );
}
