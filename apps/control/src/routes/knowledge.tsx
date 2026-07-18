import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Database, FlaskConical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewBadge } from "@/components/shared/preview-badge";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { knowledgeSourcePreviews, type KnowledgeSourcePreview } from "@/lib/preview-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledge")({ component: KnowledgeBase });

const emptyDraft = {
  authReference: "",
  description: "",
  endpoint: "",
  mode: "Hybrid" as KnowledgeSourcePreview["mode"],
  name: "",
  topK: 8,
};

function KnowledgeBase() {
  const [items, setItems] = useState(knowledgeSourcePreviews);
  const [selectedId, setSelectedId] = useState(items[0]!.id);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState("");
  const [testQuery, setTestQuery] = useState("How are production incidents escalated?");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  const openForm = (item?: KnowledgeSourcePreview) => {
    setEditing(true);
    setEditingId(item?.id ?? null);
    setDraft(item ? { authReference: item.authReference, description: item.description, endpoint: item.endpoint, mode: item.mode, name: item.name, topK: item.topK } : emptyDraft);
    setNotice("");
  };
  const save = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) { setNotice("Name and retrieval endpoint are required."); return; }
    if (editingId) {
      setItems((current) => current.map((item) => item.id === editingId ? { ...item, ...draft, status: "UNCHECKED" } : item));
      setSelectedId(editingId);
      setNotice("Knowledge endpoint updated in this preview.");
    } else {
      const id = `kb-preview-${Date.now()}`;
      setItems((current) => [...current, { ...draft, id, status: "UNCHECKED" }]);
      setSelectedId(id);
      setNotice("Knowledge endpoint added in this preview.");
    }
    setEditing(false);
  };
  const test = () => {
    if (!selected || !testQuery.trim()) { setNotice("Enter a test query first."); return; }
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, status: "READY" } : item));
    setNotice(`Retrieval preview returned ${selected.topK} simulated passages for “${testQuery.trim()}”.`);
  };
  const remove = () => {
    if (!selected) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("Knowledge endpoint removed from this preview.");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Base" badge={<PreviewBadge />} description="Describe retrieval endpoints that an Agent can query for grounded context. TaskLattice stores connection metadata, not the indexed corpus." actions={<Button className="h-11" onClick={() => openForm()}><Plus /> Add Endpoint</Button>} />
      <div className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm"><strong>Interaction preview.</strong> Endpoint checks and retrieval results are simulated; no agent or knowledge service is contacted.</div>
      {notice ? <p role="status" className="border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">{notice}</p> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="border-b"><CardTitle>Retrieval endpoints</CardTitle><CardDescription>Agent-facing interfaces for hybrid, vector, or keyword retrieval.</CardDescription></CardHeader>
          <CardContent className="px-0">
            {items.length ? items.map((item) => (
              <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setEditing(false); setNotice(""); }} className={cn("grid min-h-28 w-full gap-3 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-center", selected?.id === item.id && "bg-muted/70 shadow-[inset_3px_0_0_var(--primary)]")}>
                <span className="min-w-0"><span className="flex items-center gap-2"><Database className="size-4 text-primary" /><strong>{item.name}</strong></span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{item.description}</span><span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{item.endpoint}</span></span>
                <span className="text-xs"><span className="block text-muted-foreground">Retrieval</span><strong className="mt-1 block">{item.mode}</strong></span>
                <StatusDot label={item.status} tone={item.status === "READY" ? "success" : "neutral"} />
              </button>
            )) : <div className="px-6 py-16 text-center"><Database className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">No knowledge endpoints</strong><p className="mt-1 text-xs text-muted-foreground">Add an endpoint to begin.</p></div>}
          </CardContent>
        </Card>
        <Card className="self-start xl:sticky xl:top-24">
          {editing ? (
            <>
              <CardHeader className="border-b"><CardTitle>{editingId ? "Update Endpoint" : "Add Endpoint"}</CardTitle><CardDescription>Configure the contract an Agent will use for retrieval.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="kb-name">Name</Label><Input id="kb-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Engineering Handbook" /></div>
                <div className="space-y-2"><Label htmlFor="kb-endpoint">Retrieval endpoint</Label><Input id="kb-endpoint" className="h-11" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} placeholder="https://knowledge.example.com/search" /></div>
                <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="kb-mode">Mode</Label><select id="kb-mode" className="flex h-11 w-full border border-input bg-background px-3 text-sm" value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as KnowledgeSourcePreview["mode"] })}><option>Hybrid</option><option>Vector</option><option>Keyword</option></select></div><div className="space-y-2"><Label htmlFor="kb-topk">Top K</Label><Input id="kb-topk" className="h-11" type="number" min={1} max={50} value={draft.topK} onChange={(event) => setDraft({ ...draft, topK: Number(event.target.value) })} /></div></div>
                <div className="space-y-2"><Label htmlFor="kb-auth">Credential reference</Label><Input id="kb-auth" className="h-11" value={draft.authReference} onChange={(event) => setDraft({ ...draft, authReference: event.target.value })} placeholder="vault://team/credential" /></div>
                <div className="space-y-2"><Label htmlFor="kb-description">Description</Label><Textarea id="kb-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
                <div className="flex gap-2"><Button className="flex-1" onClick={save}>{editingId ? "Save changes" : "Add Endpoint"}</Button><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div>
              </CardContent>
            </>
          ) : selected ? (
            <>
              <CardHeader className="border-b"><div className="flex items-center justify-between"><StatusDot label={selected.status} tone={selected.status === "READY" ? "success" : "neutral"} /><span className="text-xs text-muted-foreground">Top {selected.topK}</span></div><CardTitle className="mt-3">{selected.name}</CardTitle><CardDescription>{selected.description}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <dl className="text-xs">{[["Endpoint", selected.endpoint], ["Retrieval mode", selected.mode], ["Credential", selected.authReference || "None"]].map(([label, value]) => <div key={label} className="border-b py-3"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>)}</dl>
                <div className="space-y-2"><Label htmlFor="kb-test">Test retrieval</Label><div className="flex gap-2"><Input id="kb-test" value={testQuery} onChange={(event) => setTestQuery(event.target.value)} /><Button aria-label="Run test retrieval" onClick={test}><Search /></Button></div><p className="text-xs leading-5 text-muted-foreground">Runs a simulated request using this endpoint, mode, and Top K.</p></div>
                <div className="grid gap-2"><Button onClick={test}><FlaskConical /> Check & preview query</Button><Button variant="outline" onClick={() => openForm(selected)}><Pencil /> Update endpoint</Button><Button variant="destructive" onClick={remove}><Trash2 /> Remove Endpoint</Button></div>
              </CardContent>
            </>
          ) : <CardContent className="py-16 text-center"><strong>No endpoint selected</strong></CardContent>}
        </Card>
      </div>
    </div>
  );
}
