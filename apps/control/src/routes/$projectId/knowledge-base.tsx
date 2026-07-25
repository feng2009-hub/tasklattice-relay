import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createKnowledgeSourceDefinitionSchema,
  type CreateKnowledgeSourceDefinitionInput,
  type KnowledgeSourceDefinition,
} from "@tasklattice/contracts";
import { Database, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
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

const emptyDraft: CreateKnowledgeSourceDefinitionInput = {
  credentialReference: "",
  description: "",
  name: "",
  provider: "openai",
  topK: 8,
  vectorStoreId: "",
};

function editableSource(source: KnowledgeSourceDefinition): CreateKnowledgeSourceDefinitionInput {
  const {
    id: _id,
    status: _status,
    lastReconciliationError: _lastReconciliationError,
    ...input
  } = source;
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
  const [draft, setDraft] = useState<CreateKnowledgeSourceDefinitionInput>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = items.find((item) => item.id === selectedId);

  const saveSource = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateKnowledgeSourceDefinitionInput }) =>
      id ? api.updateKnowledgeSource(id, input) : api.createKnowledgeSource(input),
    onSuccess: async (source) => {
      setSelectedId(source.id);
      setFormOpen(false);
      setDetailOpen(true);
      setFormError("");
      setNotice(source.status === "REGISTERED"
        ? "LiteLLM Vector Store registration and Project Team permission are synchronized."
        : `Desired state was saved, but LiteLLM reconciliation failed: ${source.lastReconciliationError ?? "Unavailable"}.`);
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
    },
  });
  const reconcileSource = useMutation({
    mutationFn: (source: KnowledgeSourceDefinition) => api.updateKnowledgeSource(source.id, editableSource(source)),
    onSuccess: async (source) => {
      setNotice(source.status === "REGISTERED"
        ? "LiteLLM Vector Store and Project permission were reconciled."
        : `Reconciliation failed: ${source.lastReconciliationError ?? "Unavailable"}.`);
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
    },
  });
  const deleteSource = useMutation({
    mutationFn: (id: string) => api.deleteResource("knowledge-sources", id),
    onSuccess: async () => {
      setDetailOpen(false);
      setSelectedId("");
      setNotice("LiteLLM Vector Store registration and its Project permission were removed.");
      await queryClient.invalidateQueries({ queryKey: scope.key("resource-catalog") });
    },
  });

  const openForm = (item?: KnowledgeSourceDefinition) => {
    saveSource.reset();
    setDetailOpen(false);
    setFormOpen(true);
    setEditingId(item?.id ?? null);
    setDraft(item ? editableSource(item) : emptyDraft);
    setFormError("");
    setNotice("");
  };
  const save = () => {
    const parsed = createKnowledgeSourceDefinitionSchema.safeParse({
      ...draft,
      apiBase: draft.apiBase || undefined,
      embeddingModel: draft.embeddingModel || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Review the Vector Store configuration.");
      return;
    }
    saveSource.mutate({ ...(editingId ? { id: editingId } : {}), input: parsed.data });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="Project-isolated LiteLLM Vector Stores available to explicitly selected Instance Keys."
        actions={<Button className="h-11" onClick={() => openForm()}><Plus /> Register Vector Store</Button>}
      />
      {catalog.isPending ? <p className="border p-4 text-sm text-muted-foreground">Loading LiteLLM Vector Stores…</p> : null}
      {catalog.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{catalog.error.message}</p> : null}
      {saveSource.error || reconcileSource.error || deleteSource.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{(saveSource.error ?? reconcileSource.error ?? deleteSource.error)?.message}</p> : null}
      {notice ? <p role="status" className="border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">{notice}</p> : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Managed Vector Stores</CardTitle>
          <CardDescription>TaskLattice owns desired state; LiteLLM owns provider routing and object permissions.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {items.length ? items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-haspopup="dialog"
              onClick={() => { setSelectedId(item.id); setDetailOpen(true); setNotice(""); }}
              className="grid min-h-28 w-full gap-3 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2"><Database className="size-4 text-primary" /><strong>{item.name}</strong></span>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{item.vectorStoreId}</span>
              </span>
              <span className="text-xs"><span className="block text-muted-foreground">Provider</span><strong className="mt-1 block uppercase">{item.provider}</strong></span>
              <StatusDot label={item.status} tone={item.status === "REGISTERED" ? "success" : "danger"} />
            </button>
          )) : (
            <div className="px-6 py-16 text-center">
              <Database className="mx-auto size-6 text-muted-foreground" />
              <strong className="mt-3 block">No Vector Stores registered</strong>
              <p className="mt-1 text-xs text-muted-foreground">Register an existing provider Vector Store to expose it through LiteLLM.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <EntitySheet
        open={detailOpen && Boolean(selected)}
        onOpenChange={setDetailOpen}
        eyebrow="Knowledge Base"
        title={selected?.name ?? "Vector Store details"}
        description={selected?.description ?? "Review LiteLLM registration and Project access."}
        width="md"
        footer={(
          <>
            <Button variant="destructive" disabled={deleteSource.isPending} onClick={() => selected && deleteSource.mutate(selected.id)}>
              <Trash2 />{deleteSource.isPending ? "Removing…" : "Remove Vector Store"}
            </Button>
            <Button variant="outline" onClick={() => selected && openForm(selected)}><Pencil /> Update metadata</Button>
            <Button disabled={reconcileSource.isPending} onClick={() => selected && reconcileSource.mutate(selected)}>
              <RefreshCw />{reconcileSource.isPending ? "Reconciling…" : "Reconcile"}
            </Button>
          </>
        )}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <StatusDot label={selected.status} tone={selected.status === "REGISTERED" ? "success" : "danger"} />
              <span className="text-xs text-muted-foreground">Top {selected.topK}</span>
            </div>
            <EntityDetailList items={[
              { label: "Vector Store ID", value: selected.vectorStoreId, mono: true },
              { label: "Provider", value: selected.provider.toUpperCase() },
              { label: "API base", value: selected.apiBase ?? "Provider default", mono: Boolean(selected.apiBase) },
              { label: "Embedding model", value: selected.embeddingModel ?? "Provider default" },
              { label: "Credential", value: selected.credentialReference || "Provider workload identity", mono: Boolean(selected.credentialReference) },
            ]} />
            <div className="border bg-muted/25 p-4 text-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 text-primary" />
                <div><strong>Project and Instance scoped</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">The Vector Store is added to this Project Team, then only to Instance Keys that select this Knowledge Base.</p></div>
              </div>
            </div>
            {selected.lastReconciliationError ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">{selected.lastReconciliationError}</p> : null}
          </div>
        ) : null}
      </EntitySheet>

      <EntitySheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!saveSource.isPending) {
            setFormOpen(open);
            if (!open) { setFormError(""); saveSource.reset(); }
          }
        }}
        eyebrow="Knowledge Base"
        title={editingId ? "Update Vector Store" : "Register Vector Store"}
        description="Register an existing provider Vector Store in LiteLLM. Secret values remain server-side."
        width="md"
        footer={(
          <>
            <Button variant="outline" disabled={saveSource.isPending} onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button disabled={saveSource.isPending} onClick={save}>{saveSource.isPending ? "Reconciling…" : editingId ? "Save & reconcile" : "Register"}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="kb-name">Display name</Label><Input id="kb-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Engineering Handbook" /></div>
          <div className="space-y-2"><Label htmlFor="kb-vector-store-id">Provider Vector Store ID</Label><Input id="kb-vector-store-id" className="h-11 font-mono" value={draft.vectorStoreId} disabled={Boolean(editingId)} onChange={(event) => setDraft({ ...draft, vectorStoreId: event.target.value })} placeholder="vs_..." /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="kb-provider">Provider</Label><select id="kb-provider" className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value as KnowledgeSourceDefinition["provider"] })}><option value="openai">OpenAI</option><option value="azure">Azure OpenAI</option><option value="bedrock">Amazon Bedrock</option><option value="vertex_ai">Google Vertex AI</option></select></div>
            <div className="space-y-2"><Label htmlFor="kb-topk">Default Top K</Label><Input id="kb-topk" className="h-11" type="number" min={1} max={50} value={draft.topK} onChange={(event) => setDraft({ ...draft, topK: Number(event.target.value) })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="kb-api-base">API base (optional)</Label><Input id="kb-api-base" className="h-11 font-mono" value={draft.apiBase ?? ""} onChange={(event) => setDraft({ ...draft, apiBase: event.target.value })} placeholder="https://resource.openai.azure.com" /></div>
          <div className="space-y-2"><Label htmlFor="kb-embedding">LiteLLM embedding model (optional)</Label><Input id="kb-embedding" className="h-11 font-mono" value={draft.embeddingModel ?? ""} onChange={(event) => setDraft({ ...draft, embeddingModel: event.target.value })} placeholder="text-embedding-3-large" /></div>
          <div className="space-y-2"><Label htmlFor="kb-auth">Credential Secret reference</Label><Input id="kb-auth" className="h-11 font-mono" value={draft.credentialReference} onChange={(event) => setDraft({ ...draft, credentialReference: event.target.value })} placeholder="k8s://namespace/secret#VECTOR_STORE_CREDENTIAL" /><p className="text-xs leading-5 text-muted-foreground">Use a JSON object for AWS or multi-field provider credentials. Leave blank for workload identity.</p></div>
          <div className="space-y-2"><Label htmlFor="kb-description">Description</Label><Textarea id="kb-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
          {formError || saveSource.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError || saveSource.error?.message}</p> : null}
        </div>
      </EntitySheet>
    </div>
  );
}
