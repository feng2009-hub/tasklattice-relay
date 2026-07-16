import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, Plus, Search, SquareTerminal } from "lucide-react";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { InstanceDetailDrawer } from "@/components/instances/instance-detail-drawer";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/instances")({ component: Instances });

function Instances() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const selectedTriggerRef = useRef<HTMLButtonElement>(null);
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    refetchInterval: 2_000,
  });
  const filtered = useMemo(
    () =>
      (agents.data ?? []).filter((agent) =>
        `${agent.name} ${agent.id} ${agent.sandboxName}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [agents.data, query],
  );
  const selected = filtered.find((agent) => agent.id === selectedId);
  const remove = useMutation({
    mutationFn: api.deleteAgent,
    onSuccess: async () => {
      setSelectedId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent / Instance"
        title="Instances"
        description="Select a row to open NemoClaw through its HTTP Endpoint, terminal, or full Instance detail."
        actions={
          <Button asChild className="h-11">
            <Link to="/agents/new"><Plus /> Create Instance</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Instance list</CardTitle>
              <CardDescription className="mt-1">{filtered.length} visible item{filtered.length === 1 ? "" : "s"}</CardDescription>
            </div>
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Search instances</span>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instances" className="h-11 pl-9" />
            </label>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {filtered.length ? (
            <>
              <div className="hidden grid-cols-[minmax(0,1.4fr)_1fr_0.7fr_auto_3rem] items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground sm:grid">
                <span>Instance</span><span>OpenShell Sandbox</span><span>Updated</span><span>Status</span><span className="sr-only">Terminal</span>
              </div>
              {filtered.map((agent) => (
                <div
                  key={agent.id}
                  className={cn(
                    "group relative grid min-h-16 grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-3 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/45 sm:grid-cols-[minmax(0,1.4fr)_1fr_0.7fr_auto_3rem]",
                    selected?.id === agent.id && "bg-muted/70 shadow-[inset_3px_0_0_var(--foreground)]",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Open actions for ${agent.name}`}
                    aria-pressed={selected?.id === agent.id}
                    onClick={(event) => {
                      selectedTriggerRef.current = event.currentTarget;
                      setSelectedId(agent.id);
                    }}
                    className="absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  />
                  <span className="pointer-events-none relative z-10 min-w-0">
                    <strong className="block truncate font-medium">{agent.name}</strong>
                    <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">{agent.id.slice(0, 8)}</span>
                  </span>
                  <span className="pointer-events-none relative z-10 hidden truncate font-mono text-xs sm:block">{agent.sandboxName}</span>
                  <span className="pointer-events-none relative z-10 hidden text-xs text-muted-foreground sm:block">
                    {new Date(agent.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="pointer-events-none relative z-10"><AgentStatusBadge status={agent.status} /></span>
                  <Link
                    to="/agents/$agentId"
                    params={{ agentId: agent.id }}
                    hash="terminal"
                    aria-label={`Open terminal for ${agent.name}`}
                    className="relative z-20 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2"
                  >
                    <SquareTerminal className="size-[18px]" />
                  </Link>
                </div>
              ))}
            </>
          ) : (
            <EmptyState icon={Boxes} title="No matching instances" description="Adjust the query or create a new Instance." />
          )}
        </CardContent>
      </Card>

      <InstanceDetailDrawer
        {...(selected ? { instance: selected } : {})}
        deleting={remove.isPending}
        {...(remove.error ? { deleteError: remove.error.message } : {})}
        onClose={() => setSelectedId(undefined)}
        onDelete={() => selected && remove.mutate(selected.id)}
        returnFocusRef={selectedTriggerRef}
      />
    </div>
  );
}
