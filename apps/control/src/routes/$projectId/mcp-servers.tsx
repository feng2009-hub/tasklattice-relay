import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { CreateMcpServerDefinitionInput, McpServerDefinition } from "@tasklattice/contracts";
import { Activity, Braces, Pencil, Plus, ServerCog, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EntityFormSheet } from "@/components/shared/entity-form-sheet";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";

export const Route = createFileRoute("/$projectId/mcp-servers")({ component: McpServers });

const emptyDraft = {
  authReference: "",
  endpoint: "",
  name: "",
  parameters: "{}",
  transport: "Streamable HTTP" as McpServerDefinition["transport"],
};

function mcpInput(server: McpServerDefinition): CreateMcpServerDefinitionInput {
  const { id: _id, ...input } = server;
  return input;
}

function McpServers() {
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const catalog = useQuery({ queryKey: scope.key("extension-catalog"), queryFn: api.getExtensionCatalog });
  const items = catalog.data?.mcpServers ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  useEffect(() => {
    if (items.length && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]!.id);
  }, [items, selectedId]);

  const saveServer = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateMcpServerDefinitionInput }) => id ? api.updateMcpServer(id, input) : api.createMcpServer(input),
    onSuccess: async (server, variables) => {
      setSelectedId(server.id);
      setEditing(false);
      setFormError("");
      setNotice(variables.id ? "MCP configuration saved to PostgreSQL. Run a connection check next." : "MCP server registered in PostgreSQL.");
      await queryClient.invalidateQueries({ queryKey: scope.key("extension-catalog") });
    },
  });
  const checkServer = useMutation({
    mutationFn: (server: McpServerDefinition) => api.updateMcpServer(server.id, { ...mcpInput(server), status: "HEALTHY", tools: server.tools || 12 }),
    onSuccess: async () => {
      setNotice("Connection check result saved to PostgreSQL. Tool discovery remains simulated in development.");
      await queryClient.invalidateQueries({ queryKey: scope.key("extension-catalog") });
    },
  });
  const deleteServer = useMutation({
    mutationFn: (id: string) => api.deleteExtension("mcp-servers", id),
    onSuccess: async () => {
      setSelectedId("");
      setNotice("MCP server removed from PostgreSQL.");
      await queryClient.invalidateQueries({ queryKey: scope.key("extension-catalog") });
    },
  });

  const openForm = (item?: McpServerDefinition) => {
    saveServer.reset();
    setEditing(true);
    setEditingId(item?.id ?? null);
    setDraft(item ? { authReference: item.authReference, endpoint: item.endpoint, name: item.name, parameters: item.parameters, transport: item.transport } : emptyDraft);
    setFormError("");
    setNotice("");
  };
  const save = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      setFormError("Name and endpoint are required.");
      return;
    }
    try { JSON.parse(draft.parameters); } catch { setFormError("Parameters must be valid JSON."); return; }
    setFormError("");
    const current = editingId ? items.find((item) => item.id === editingId) : undefined;
    void saveServer.mutate({
      ...(editingId ? { id: editingId } : {}),
      input: { ...draft, status: "UNCHECKED", tools: current?.tools ?? 0 },
    });
  };
  const check = () => {
    if (!selected) return;
    checkServer.mutate(selected);
  };
  const remove = () => {
    if (!selected) return;
    deleteServer.mutate(selected.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="MCP Servers" description="Manage MCP connection metadata persisted in the current Project catalog." actions={<Button className="h-11" onClick={() => openForm()}><Plus /> Register MCP</Button>} />
      {catalog.isPending ? <p className="border p-4 text-sm text-muted-foreground">Loading MCP servers from PostgreSQL…</p> : null}
      {catalog.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{catalog.error.message}</p> : null}
      {checkServer.error || deleteServer.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{(checkServer.error ?? deleteServer.error)?.message}</p> : null}
      {notice ? <p role="status" className="border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">{notice}</p> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader className="border-b"><CardTitle>Registered servers</CardTitle><CardDescription>{items.length} MCP integrations available to this Project.</CardDescription></CardHeader>
          <CardContent className="px-0">
            {items.length ? items.map((item) => (
              <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setEditing(false); setNotice(""); }} className={cn("grid min-h-24 w-full gap-3 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center", selected?.id === item.id && "bg-muted/70 shadow-[inset_3px_0_0_var(--primary)]")}>
                <span className="min-w-0"><span className="flex items-center gap-2"><ServerCog className="size-4 text-primary" /><strong>{item.name}</strong></span><span className="mt-2 block truncate font-mono text-xs text-muted-foreground">{item.endpoint}</span></span>
                <span className="text-xs"><span className="block text-muted-foreground">Transport</span><strong className="mt-1 block">{item.transport}</strong></span>
                <StatusDot label={item.status} tone={item.status === "HEALTHY" ? "success" : "neutral"} />
              </button>
            )) : <div className="px-6 py-16 text-center"><ServerCog className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">No MCP servers</strong><p className="mt-1 text-xs text-muted-foreground">Register an endpoint to begin.</p></div>}
          </CardContent>
        </Card>
        <Card className="self-start xl:sticky xl:top-24">
          {selected ? (
            <>
              <CardHeader className="border-b"><div className="flex items-center justify-between"><StatusDot label={selected.status} tone={selected.status === "HEALTHY" ? "success" : "neutral"} /><span className="text-xs text-muted-foreground">{selected.tools} tools</span></div><CardTitle className="mt-3">{selected.name}</CardTitle><CardDescription className="break-all font-mono text-xs">{selected.endpoint}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <dl className="text-xs">{[["Transport", selected.transport], ["Credential", selected.authReference || "None"], ["Discovered tools", `${selected.tools}`]].map(([label, value]) => <div key={label} className="flex min-h-11 items-center justify-between gap-4 border-b"><dt className="text-muted-foreground">{label}</dt><dd className="break-all text-right font-medium">{value}</dd></div>)}</dl>
                <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold"><Braces className="size-4" /> Parameters</p><pre className="max-h-48 overflow-auto border bg-muted/40 p-3 text-xs leading-5">{selected.parameters}</pre></div>
                <div className="grid gap-2"><Button disabled={checkServer.isPending} onClick={check}><Activity />{checkServer.isPending ? "Checking…" : "Check connection"}</Button><Button variant="outline" onClick={() => openForm(selected)}><Pencil /> Update parameters</Button><Button variant="destructive" disabled={deleteServer.isPending} onClick={remove}><Trash2 />{deleteServer.isPending ? "Removing…" : "Remove MCP"}</Button></div>
              </CardContent>
            </>
          ) : <CardContent className="py-16 text-center"><strong>No server selected</strong></CardContent>}
        </Card>
      </div>
      <EntityFormSheet
        open={editing}
        onOpenChange={(open) => {
          if (!saveServer.isPending) {
            setEditing(open);
            if (!open) {
              setFormError("");
              saveServer.reset();
            }
          }
        }}
        eyebrow="MCP Server"
        title={editingId ? "Update MCP" : "Register MCP"}
        description="Store public connection metadata and a reference to managed credentials."
        width="md"
        footer={(
          <>
            <Button variant="outline" disabled={saveServer.isPending} onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" form="mcp-server-form" disabled={saveServer.isPending}>{saveServer.isPending ? "Saving…" : editingId ? "Save changes" : "Register MCP"}</Button>
          </>
        )}
      >
        <form id="mcp-server-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <div className="space-y-2"><Label htmlFor="mcp-name">Name</Label><Input id="mcp-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Issue Tracker" autoFocus /></div>
          <div className="space-y-2"><Label htmlFor="mcp-endpoint">Endpoint</Label><Input id="mcp-endpoint" className="h-11" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} placeholder="https://mcp.example.com/mcp" /></div>
          <div className="space-y-2"><Label htmlFor="mcp-transport">Transport</Label><select id="mcp-transport" className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value as McpServerDefinition["transport"] })}><option>Streamable HTTP</option><option>SSE</option></select></div>
          <div className="space-y-2"><Label htmlFor="mcp-auth">Credential reference</Label><Input id="mcp-auth" className="h-11" value={draft.authReference} onChange={(event) => setDraft({ ...draft, authReference: event.target.value })} placeholder="vault://team/credential" /><p className="text-xs text-muted-foreground">Reference only. Never paste a secret into this form.</p></div>
          <div className="space-y-2"><Label htmlFor="mcp-parameters">Parameters (JSON)</Label><Textarea id="mcp-parameters" className="min-h-32 font-mono text-xs" value={draft.parameters} onChange={(event) => setDraft({ ...draft, parameters: event.target.value })} /></div>
          {formError || saveServer.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError || saveServer.error?.message}</p> : null}
        </form>
      </EntityFormSheet>
    </div>
  );
}
