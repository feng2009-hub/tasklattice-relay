import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Braces, Pencil, Plus, ServerCog, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewBadge } from "@/components/shared/preview-badge";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mcpServerPreviews, type McpServerPreview } from "@/lib/preview-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mcp")({ component: McpServers });

const emptyDraft = {
  authReference: "",
  endpoint: "",
  name: "",
  parameters: "{}",
  transport: "Streamable HTTP" as McpServerPreview["transport"],
};

function McpServers() {
  const [items, setItems] = useState(mcpServerPreviews);
  const [selectedId, setSelectedId] = useState(items[0]!.id);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  const openForm = (item?: McpServerPreview) => {
    setEditing(true);
    setEditingId(item?.id ?? null);
    setDraft(item ? { authReference: item.authReference, endpoint: item.endpoint, name: item.name, parameters: item.parameters, transport: item.transport } : emptyDraft);
    setNotice("");
  };
  const save = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      setNotice("Name and endpoint are required.");
      return;
    }
    try { JSON.parse(draft.parameters); } catch { setNotice("Parameters must be valid JSON."); return; }
    if (editingId) {
      setItems((current) => current.map((item) => item.id === editingId ? { ...item, ...draft, status: "UNCHECKED" } : item));
      setSelectedId(editingId);
      setNotice("MCP parameters updated in this preview. Run a connection check next.");
    } else {
      const id = `mcp-preview-${Date.now()}`;
      setItems((current) => [...current, { ...draft, id, status: "UNCHECKED", tools: 0 }]);
      setSelectedId(id);
      setNotice("MCP server registered in this preview.");
    }
    setEditing(false);
  };
  const check = () => {
    if (!selected) return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, status: "HEALTHY", tools: item.tools || 12 } : item));
    setNotice("Connection check passed. Tool discovery is simulated.");
  };
  const remove = () => {
    if (!selected) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("MCP server removed from this preview.");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="MCP Servers" badge={<PreviewBadge />} description="Register remote MCP servers, inspect discovered tools, and maintain connection parameters before attaching them to an Agent." actions={<Button className="h-11" onClick={() => openForm()}><Plus /> Register MCP</Button>} />
      <div className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm"><strong>Interaction preview.</strong> Registration, checks, updates, and removal stay in this browser session and do not call a backend.</div>
      {notice ? <p role="status" className="border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">{notice}</p> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader className="border-b"><CardTitle>Registered servers</CardTitle><CardDescription>{items.length} MCP integrations available to this workspace.</CardDescription></CardHeader>
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
          {editing ? (
            <>
              <CardHeader className="border-b"><CardTitle>{editingId ? "Update MCP" : "Register MCP"}</CardTitle><CardDescription>Store public connection metadata and a reference to managed credentials.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="mcp-name">Name</Label><Input id="mcp-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Issue Tracker" /></div>
                <div className="space-y-2"><Label htmlFor="mcp-endpoint">Endpoint</Label><Input id="mcp-endpoint" className="h-11" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} placeholder="https://mcp.example.com/mcp" /></div>
                <div className="space-y-2"><Label htmlFor="mcp-transport">Transport</Label><select id="mcp-transport" className="flex h-11 w-full border border-input bg-background px-3 text-sm" value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value as McpServerPreview["transport"] })}><option>Streamable HTTP</option><option>SSE</option></select></div>
                <div className="space-y-2"><Label htmlFor="mcp-auth">Credential reference</Label><Input id="mcp-auth" className="h-11" value={draft.authReference} onChange={(event) => setDraft({ ...draft, authReference: event.target.value })} placeholder="vault://team/credential" /><p className="text-xs text-muted-foreground">Reference only. Never paste a secret into this form.</p></div>
                <div className="space-y-2"><Label htmlFor="mcp-parameters">Parameters (JSON)</Label><Textarea id="mcp-parameters" className="min-h-32 font-mono text-xs" value={draft.parameters} onChange={(event) => setDraft({ ...draft, parameters: event.target.value })} /></div>
                <div className="flex gap-2"><Button className="flex-1" onClick={save}>{editingId ? "Save parameters" : "Register"}</Button><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div>
              </CardContent>
            </>
          ) : selected ? (
            <>
              <CardHeader className="border-b"><div className="flex items-center justify-between"><StatusDot label={selected.status} tone={selected.status === "HEALTHY" ? "success" : "neutral"} /><span className="text-xs text-muted-foreground">{selected.tools} tools</span></div><CardTitle className="mt-3">{selected.name}</CardTitle><CardDescription className="break-all font-mono text-xs">{selected.endpoint}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <dl className="text-xs">{[["Transport", selected.transport], ["Credential", selected.authReference || "None"], ["Discovered tools", `${selected.tools}`]].map(([label, value]) => <div key={label} className="flex min-h-11 items-center justify-between gap-4 border-b"><dt className="text-muted-foreground">{label}</dt><dd className="break-all text-right font-medium">{value}</dd></div>)}</dl>
                <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold"><Braces className="size-4" /> Parameters</p><pre className="max-h-48 overflow-auto border bg-muted/40 p-3 text-xs leading-5">{selected.parameters}</pre></div>
                <div className="grid gap-2"><Button onClick={check}><Activity /> Check connection</Button><Button variant="outline" onClick={() => openForm(selected)}><Pencil /> Update parameters</Button><Button variant="destructive" onClick={remove}><Trash2 /> Remove MCP</Button></div>
              </CardContent>
            </>
          ) : <CardContent className="py-16 text-center"><strong>No server selected</strong></CardContent>}
        </Card>
      </div>
    </div>
  );
}
