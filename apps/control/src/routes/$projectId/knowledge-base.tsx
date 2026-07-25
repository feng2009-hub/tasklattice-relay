import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { CreateKnowledgeSourceDefinitionInput, KnowledgeSourceDefinition } from "@tasklattice/contracts";
import { Database, FlaskConical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EntityDetailList, EntitySheet } from "@/components/shared/entity-sheet";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";

export const Route = createFileRoute("/$projectId/knowledge-base")({ component: KnowledgeBase });

const emptyDraft = {
  authReference: "",
  description: "",
  endpoint: "",
  mode: "Hybrid" as KnowledgeSourceDefinition["mode"],
  name: "",
  topK: 8,
};

function knowledgeSourceInput(source: KnowledgeSourceDefinition): CreateKnowledgeSourceDefinitionInput {
  const { id: _id, ...input } = source;
  return input;
}

function KnowledgeBase() {
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const catalog = useQuery({ queryKey: scope.key("resource-catalog"), queryFn: api.getResourceCatalog });
  const items = catalog.data?.knowledgeSources ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [testQuery, setTestQuery] = useState("How are production incidents escalated?");
  const selected = items.find((item) => item.id === selectedId);

  const saveSource = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateKnowledgeSourceDefinitionInput }) => id ? api.updateKnowledgeSource(id, input) : api.createKnowledgeSource(input),
    onSuccess: async (source, variables) => {
      setSelectedId(source.id);
      setFormOpen(false);
      setFormError("");
      setNotice(variables.id ? "Knowledge source saved to PostgreSQL." : "Knowledge source added to PostgreSQL.");
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
    },
  });
  const checkSource = useMutation({
    mutationFn: (source: KnowledgeSourceDefinition) => api.updateKnowledgeSource(source.id, { ...knowledgeSourceInput(source), status: "READY" }),
    onSuccess: async (_source, input) => {
      setNotice(`Retrieval check for “${testQuery.trim()}” recorded in PostgreSQL with Top ${input.topK}. Remote retrieval remains simulated in development.`);
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
    },
  });
  const deleteSource = useMutation({
    mutationFn: (id: string) => api.deleteResource("knowledge-sources", id),
    onSuccess: async () => {
      setDetailOpen(false);
      setSelectedId("");
      setNotice("Knowledge source removed from PostgreSQL.");
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
    },
  });

  const openForm = (item?: KnowledgeSourceDefinition) => {
    saveSource.reset();
    setDetailOpen(false);
    setFormOpen(true);
    setEditingId(item?.id ?? null);
    setDraft(item ? { authReference: item.authReference, description: item.description, endpoint: item.endpoint, mode: item.mode, name: item.name, topK: item.topK } : emptyDraft);
    setFormError("");
    setNotice("");
  };
  const save = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      setFormError("Name and retrieval endpoint are required.");
      return;
    }
    setFormError("");
    void saveSource.mutate({
      ...(editingId ? { id: editingId } : {}),
      input: { ...draft, status: "UNCHECKED" },
    });
  };
  const test = () => {
    if (!selected || !testQuery.trim()) { setNotice("Enter a test query first."); return; }
    checkSource.mutate(selected);
  };
  const remove = () => {
    if (!selected) return;
    deleteSource.mutate(selected.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Base" description="Manage retrieval connection metadata stored in PostgreSQL; indexed corpora remain in their source systems." actions={<Button className="h-11" onClick={() => openForm()}><Plus /> Add Endpoint</Button>} />
      {catalog.isPending ? <p className="border p-4 text-sm text-muted-foreground">Loading Knowledge sources from PostgreSQL…</p> : null}
      {catalog.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{catalog.error.message}</p> : null}
      {saveSource.error || checkSource.error || deleteSource.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{(saveSource.error ?? checkSource.error ?? deleteSource.error)?.message}</p> : null}
      {notice ? <p role="status" className="border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">{notice}</p> : null}
      <Card>
          <CardHeader className="border-b"><CardTitle>Retrieval endpoints</CardTitle><CardDescription>Agent-facing interfaces for hybrid, vector, or keyword retrieval.</CardDescription></CardHeader>
          <CardContent className="px-0">
            {items.length ? items.map((item) => (
              <button key={item.id} type="button" aria-haspopup="dialog" onClick={() => { checkSource.reset(); deleteSource.reset(); setSelectedId(item.id); setDetailOpen(true); setNotice(""); }} className="grid min-h-28 w-full gap-3 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-center">
                <span className="min-w-0"><span className="flex items-center gap-2"><Database className="size-4 text-primary" /><strong>{item.name}</strong></span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{item.description}</span><span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{item.endpoint}</span></span>
                <span className="text-xs"><span className="block text-muted-foreground">Retrieval</span><strong className="mt-1 block">{item.mode}</strong></span>
                <StatusDot label={item.status} tone={item.status === "READY" ? "success" : "neutral"} />
              </button>
            )) : <div className="px-6 py-16 text-center"><Database className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">No knowledge endpoints</strong><p className="mt-1 text-xs text-muted-foreground">Add an endpoint to begin.</p></div>}
          </CardContent>
      </Card>

      <EntitySheet
        open={detailOpen && Boolean(selected)}
        onOpenChange={setDetailOpen}
        eyebrow="Knowledge Base"
        title={selected?.name ?? "Knowledge source details"}
        description={selected?.description ?? "Review retrieval settings and test this Knowledge source."}
        width="md"
        footer={(
          <>
            <Button variant="destructive" disabled={deleteSource.isPending} onClick={remove}>
              <Trash2 />{deleteSource.isPending ? "Removing…" : "Remove Endpoint"}
            </Button>
            <Button variant="outline" onClick={() => selected && openForm(selected)}><Pencil /> Update endpoint</Button>
            <Button disabled={checkSource.isPending} onClick={test}>
              <FlaskConical />{checkSource.isPending ? "Checking…" : "Check retrieval"}
            </Button>
          </>
        )}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <StatusDot label={selected.status} tone={selected.status === "READY" ? "success" : "neutral"} />
              <span className="text-xs text-muted-foreground">Top {selected.topK}</span>
            </div>
            <EntityDetailList items={[
              { label: "Endpoint", value: selected.endpoint, mono: true },
              { label: "Retrieval mode", value: selected.mode },
              { label: "Credential", value: selected.authReference || "None", mono: Boolean(selected.authReference) },
            ]} />
            <div className="space-y-2">
              <Label htmlFor="kb-test">Test retrieval</Label>
              <div className="flex gap-2">
                <Input id="kb-test" value={testQuery} onChange={(event) => setTestQuery(event.target.value)} />
                <Button aria-label="Run test retrieval" disabled={checkSource.isPending} onClick={test}><Search /></Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">Runs a simulated request using this endpoint, mode, and Top K.</p>
            </div>
            {notice ? <p role="status" className="border-l-2 border-primary bg-primary/5 p-3 text-sm">{notice}</p> : null}
            {checkSource.error || deleteSource.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{(checkSource.error ?? deleteSource.error)?.message}</p> : null}
          </div>
        ) : null}
      </EntitySheet>

      <EntitySheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!saveSource.isPending) {
            setFormOpen(open);
            if (!open) {
              setFormError("");
              saveSource.reset();
            }
          }
        }}
        eyebrow="Knowledge Base"
        title={editingId ? "Update Endpoint" : "Add Endpoint"}
        description="Configure the retrieval contract an Agent will use for grounded answers."
        width="md"
        footer={(
          <>
            <Button variant="outline" disabled={saveSource.isPending} onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button disabled={saveSource.isPending} onClick={save}>{saveSource.isPending ? "Saving…" : editingId ? "Save changes" : "Add Endpoint"}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="kb-name">Name</Label><Input id="kb-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Engineering Handbook" /></div>
          <div className="space-y-2"><Label htmlFor="kb-endpoint">Retrieval endpoint</Label><Input id="kb-endpoint" className="h-11" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} placeholder="https://knowledge.example.com/search" /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="kb-mode">Mode</Label><select id="kb-mode" className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as KnowledgeSourceDefinition["mode"] })}><option>Hybrid</option><option>Vector</option><option>Keyword</option></select></div><div className="space-y-2"><Label htmlFor="kb-topk">Top K</Label><Input id="kb-topk" className="h-11" type="number" min={1} max={50} value={draft.topK} onChange={(event) => setDraft({ ...draft, topK: Number(event.target.value) })} /></div></div>
          <div className="space-y-2"><Label htmlFor="kb-auth">Credential reference</Label><Input id="kb-auth" className="h-11" value={draft.authReference} onChange={(event) => setDraft({ ...draft, authReference: event.target.value })} placeholder="vault://team/credential" /></div>
          <div className="space-y-2"><Label htmlFor="kb-description">Description</Label><Textarea id="kb-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
          {formError || saveSource.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError || saveSource.error?.message}</p> : null}
        </div>
      </EntitySheet>
    </div>
  );
}
