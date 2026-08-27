import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { VectorIngestionJob, VectorMetadataField, VectorMetadataType } from "@tali/contracts";
import { FileText, Filter, FlaskConical, LoaderCircle, Plus, X } from "lucide-react";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatPlatformDateTime } from "@/lib/platform-preferences";

export function SearchVectorsSheet({
  canViewContent,
  currentFolderId,
  currentFolderPath,
  databaseId,
  metadataSchema,
  open,
  onOpenChange,
  onViewSource,
}: {
  canViewContent: boolean;
  currentFolderId: string | null;
  currentFolderPath: string;
  databaseId: string;
  metadataSchema: VectorMetadataField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewSource: (source: { chunkId: string; documentId: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(8);
  const [scope, setScope] = useState<"database" | "folder">("database");
  const [filters, setFilters] = useState<MetadataFilterDraft[]>([]);
  const parsedFilters = useMemo(() => buildMetadataFilters(filters, metadataSchema), [filters, metadataSchema]);
  const search = useMutation({
    mutationFn: () => api.searchVectorDatabase(databaseId, {
      query,
      topK,
      ...(scope === "folder" ? { folderId: currentFolderId } : {}),
      ...(parsedFilters.data?.length ? { metadataFilters: parsedFilters.data } : {}),
    }),
  });
  const updateFilter = (id: string, patch: Partial<MetadataFilterDraft>) => {
    setFilters((current) => current.map((filter) => filter.id === id ? { ...filter, ...patch } : filter));
    search.reset();
  };
  const addFilter = () => {
    const field = metadataSchema[0];
    if (!field) return;
    setFilters((current) => [...current, {
      id: `filter-${Date.now()}-${current.length}`,
      key: field.key,
      operator: "eq",
      value: field.type === "boolean" ? false : "",
    }]);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full gap-0 overflow-hidden bg-background sm:!w-[min(96vw,58rem)] sm:!max-w-[58rem] [&>button]:size-11">
        <SheetHeader className="shrink-0 border-b px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <SheetTitle>Test retrieval</SheetTitle>
          <SheetDescription>Run the real retrieval API used by Agents against the selected scope and typed metadata filters.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {!canViewContent ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm">CAP_VECTOR_DATABASE_CONTENT_VIEW is required to search indexed content.</p>
          ) : (
            <>
              <form className="space-y-5 rounded-sm border p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); if (!parsedFilters.error) search.mutate(); }}>
                <div className="space-y-2"><Label htmlFor="retrieval-query">Query</Label><Textarea id="retrieval-query" rows={4} value={query} onChange={(event) => { setQuery(event.target.value); search.reset(); }} placeholder="What do the indexed files say about…" /></div>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
                  <div className="space-y-2"><Label>Scope</Label><Select value={scope} onValueChange={(value) => { setScope(value as "database" | "folder"); search.reset(); }}><SelectTrigger className="h-11 w-full" aria-label="Retrieval scope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="database">Entire Vector Database</SelectItem><SelectItem value="folder">Current folder · {currentFolderPath}</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="retrieval-top-k">Top K</Label><Input id="retrieval-top-k" className="h-11" type="number" min={1} max={50} value={topK} onChange={(event) => { setTopK(Math.min(50, Math.max(1, Number(event.target.value) || 1))); search.reset(); }} /></div>
                </div>
                <section className="border-t pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Filter className="size-4" />Metadata filters</h3><p className="mt-1 text-xs text-muted-foreground">Keys come from the persisted metadata schema for this Vector Database.</p></div><Button type="button" variant="outline" size="sm" disabled={!metadataSchema.length || filters.length >= 8} onClick={addFilter}><Plus />Add filter</Button></div>
                  {filters.length ? <div className="mt-4 space-y-3">{filters.map((filter, index) => <MetadataFilterRow key={filter.id} field={metadataSchema.find((candidate) => candidate.key === filter.key)} filter={filter} index={index} schema={metadataSchema} onChange={(patch) => updateFilter(filter.id, patch)} onRemove={() => { setFilters((current) => current.filter((item) => item.id !== filter.id)); search.reset(); }} />)}</div> : <p className="mt-4 rounded-sm bg-muted/25 px-4 py-3 text-xs text-muted-foreground">{metadataSchema.length ? "No metadata filters. Retrieval searches every indexed record in the selected scope." : "No custom metadata fields are defined yet. Add metadata from a file’s Metadata tab to enable filtering."}</p>}
                  {parsedFilters.error ? <p role="alert" className="mt-3 text-xs text-destructive">{parsedFilters.error}</p> : null}
                </section>
                <div className="flex justify-end border-t pt-4"><Button className="h-11" disabled={!query.trim() || Boolean(parsedFilters.error) || search.isPending} type="submit">{search.isPending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <FlaskConical />}{search.isPending ? "Testing…" : "Test retrieval"}</Button></div>
              </form>
              {search.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">{search.error.message}</p> : null}
              {search.data ? (
                <section>
                  <div className="flex items-end justify-between gap-4 border-b pb-3"><div><h3 className="text-sm font-semibold">Results</h3><p className="mt-1 text-xs text-muted-foreground">{search.data.results.length} matches in {search.data.durationMs} ms</p></div></div>
                  <div className="divide-y">
                    {search.data.results.map((result, index) => (
                      <article key={`${result.chunkId}:${index}`} className="py-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground"><FileText className="size-4" /></span><span className="min-w-0"><strong className="block truncate text-sm">{result.filename}</strong><span className="mt-1 block break-all text-xs text-muted-foreground">{result.directoryPath}</span></span></div>
                          <span className="font-mono text-xs font-medium">Score {result.score.toFixed(4)}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{result.pageNumber ? `Page ${result.pageNumber}` : "No page"}</span><span>{result.chunkIndex === null ? "Chunk —" : `Chunk ${result.chunkIndex + 1}`}</span><span className="break-all font-mono">{result.chunkId}</span></div>
                        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6">{result.content}</p>
                        <div className="mt-3"><Button variant="outline" size="sm" disabled={!result.documentId} onClick={() => { if (result.documentId) onViewSource({ chunkId: result.chunkId, documentId: result.documentId }); }}>View source</Button></div>
                      </article>
                    ))}
                    {!search.data.results.length ? <p className="py-12 text-center text-sm text-muted-foreground">No Vector Records matched this query.</p> : null}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type MetadataFilterDraft = {
  id: string;
  key: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
  value: string | boolean;
};

function MetadataFilterRow({ field, filter, index, schema, onChange, onRemove }: { field: VectorMetadataField | undefined; filter: MetadataFilterDraft; index: number; schema: VectorMetadataField[]; onChange: (patch: Partial<MetadataFilterDraft>) => void; onRemove: () => void }) {
  const type = field?.type ?? "string";
  const operators = filterOperators(type);
  return <div className="grid gap-3 rounded-sm border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_2.75rem] sm:items-end"><div className="space-y-2"><Label>Key</Label><Select value={filter.key} onValueChange={(key) => { const nextType = schema.find((candidate) => candidate.key === key)?.type ?? "string"; onChange({ key, operator: "eq", value: nextType === "boolean" ? false : "" }); }}><SelectTrigger className="h-11 w-full font-mono text-xs" aria-label={`Metadata filter ${index + 1} key`}><SelectValue /></SelectTrigger><SelectContent>{schema.map((item) => <SelectItem key={item.key} value={item.key}>{item.key} · {item.type}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Operator</Label><Select value={operators.some((item) => item.value === filter.operator) ? filter.operator : "eq"} onValueChange={(operator) => onChange({ operator: operator as MetadataFilterDraft["operator"] })}><SelectTrigger className="h-11 w-full" aria-label={`Metadata filter ${index + 1} operator`}><SelectValue /></SelectTrigger><SelectContent>{operators.map((operator) => <SelectItem key={operator.value} value={operator.value}>{operator.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor={`metadata-filter-value-${filter.id}`}>Value</Label>{type === "boolean" ? <Select value={filter.value === true ? "true" : "false"} onValueChange={(value) => onChange({ value: value === "true" })}><SelectTrigger id={`metadata-filter-value-${filter.id}`} className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">True</SelectItem><SelectItem value="false">False</SelectItem></SelectContent></Select> : <Input id={`metadata-filter-value-${filter.id}`} className="h-11" type={type === "number" ? "number" : type === "date" ? "date" : "text"} value={String(filter.value)} onChange={(event) => onChange({ value: event.target.value })} />}</div><Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-destructive" aria-label={`Remove metadata filter ${index + 1}`} onClick={onRemove}><X /></Button></div>;
}

function filterOperators(type: VectorMetadataType): Array<{ value: MetadataFilterDraft["operator"]; label: string }> {
  const equality = [{ value: "eq" as const, label: "Equals" }, { value: "ne" as const, label: "Does not equal" }];
  return type === "number" || type === "date" ? [...equality, { value: "gt", label: "Greater than" }, { value: "gte", label: "At least" }, { value: "lt", label: "Less than" }, { value: "lte", label: "At most" }] : equality;
}

function buildMetadataFilters(filters: MetadataFilterDraft[], schema: VectorMetadataField[]) {
  const fields = new Map(schema.map((field) => [field.key, field]));
  const data: Array<{ key: string; operator: MetadataFilterDraft["operator"]; value: { type: "string"; value: string } | { type: "number"; value: number } | { type: "boolean"; value: boolean } | { type: "date"; value: string } }> = [];
  for (const filter of filters) {
    const field = fields.get(filter.key);
    if (!field) return { error: `Metadata key “${filter.key}” is no longer in the database schema.` };
    if (field.type === "number") {
      const value = Number(filter.value);
      if (filter.value === "" || !Number.isFinite(value)) return { error: `Metadata filter “${filter.key}” needs a valid number.` };
      data.push({ key: filter.key, operator: filter.operator, value: { type: "number", value } });
    } else if (field.type === "boolean") data.push({ key: filter.key, operator: filter.operator, value: { type: "boolean", value: filter.value === true } });
    else if (field.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(filter.value))) return { error: `Metadata filter “${filter.key}” needs a valid date.` };
      data.push({ key: filter.key, operator: filter.operator, value: { type: "date", value: String(filter.value) } });
    } else data.push({ key: filter.key, operator: filter.operator, value: { type: "string", value: String(filter.value) } });
  }
  return { data };
}

export function VectorDatabaseActivitySheet({ jobs, open, onOpenChange }: {
  jobs: VectorIngestionJob[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(94vw,42rem)] sm:max-w-[42rem]">
        <SheetHeader className="border-b px-5 py-5">
          <SheetTitle>Vector Database activity</SheetTitle>
          <SheetDescription>Recent parsing and vector indexing jobs. Activity remains secondary to file management.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {jobs.map((job) => (
            <article key={job.id} className="border-b px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><StatusDot label={job.phase} tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "warning"} /><span className="font-mono text-[11px] text-muted-foreground">{job.id.slice(0, 8)}</span></div>
              <p className="mt-2 text-xs text-muted-foreground">File {job.documentId} · revision {job.revision} · {formatPlatformDateTime(job.updatedAt)}</p>
              <Progress value={job.progress} className="mt-3" />
              {job.error ? <p className="mt-3 text-xs leading-5 text-destructive">{job.error}</p> : null}
            </article>
          ))}
          {!jobs.length ? <p className="px-6 py-14 text-center text-sm text-muted-foreground">No ingestion activity yet.</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
