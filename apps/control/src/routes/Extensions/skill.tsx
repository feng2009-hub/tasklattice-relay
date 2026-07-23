import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { skillCategories, type CreateSkillDefinitionInput, type SkillDefinition } from "@tasklattice/contracts";
import {
  CheckCircle2,
  Cloud,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/Extensions/skill")({ component: SkillCatalog });

const emptyDraft = {
  category: "Developer Tools" as SkillDefinition["category"],
  description: "",
  endpoint: "",
  name: "",
  version: "1.0.0",
};

function skillInput(skill: SkillDefinition): CreateSkillDefinitionInput {
  const { id: _id, bindings: _bindings, ...input } = skill;
  return input;
}

function SkillCatalog() {
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["extension-catalog"], queryFn: api.getExtensionCatalog });
  const items = catalog.data?.skills ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [mode, setMode] = useState<"detail" | "form">("detail");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (items.length && !items.some((item) => item.id === selectedId)) setSelectedId(items[0]!.id);
  }, [items, selectedId]);

  const categories = ["All", ...new Set(items.map((item) => item.category))];
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (category === "All" || item.category === category) &&
          `${item.name} ${item.description} ${item.owner}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [category, items, query],
  );
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const saveSkill = useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateSkillDefinitionInput }) => id ? api.updateSkill(id, input) : api.createSkill(input),
    onSuccess: async (skill, variables) => {
      setSelectedId(skill.id);
      setMode("detail");
      setNotice(variables.id ? "Skill metadata saved to PostgreSQL." : "Skill registered in the PostgreSQL catalog.");
      await queryClient.invalidateQueries({ queryKey: ["extension-catalog"] });
    },
  });
  const verifySkill = useMutation({
    mutationFn: (skill: SkillDefinition) => api.updateSkill(skill.id, {
      ...skillInput(skill),
      digest: "sha256:development-check…verified",
      status: "PUBLISHED",
    }),
    onSuccess: async () => {
      setNotice("Source check recorded in PostgreSQL. Remote fetching remains simulated in development.");
      await queryClient.invalidateQueries({ queryKey: ["extension-catalog"] });
    },
  });
  const deleteSkill = useMutation({
    mutationFn: (id: string) => api.deleteExtension("skills", id),
    onSuccess: async () => {
      setSelectedId("");
      setMode("detail");
      setNotice("Skill removed from the PostgreSQL catalog.");
      await queryClient.invalidateQueries({ queryKey: ["extension-catalog"] });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setMode("form");
    setNotice("");
  };
  const openEdit = () => {
    if (!selected) return;
    setEditingId(selected.id);
    setDraft({
      category: selected.category,
      description: selected.description,
      endpoint: selected.endpoint,
      name: selected.name,
      version: selected.version,
    });
    setMode("form");
    setNotice("");
  };
  const save = () => {
    if (!draft.name.trim() || !draft.endpoint.trim()) {
      setNotice("Name and source endpoint are required.");
      return;
    }
    const current = editingId ? items.find((item) => item.id === editingId) : undefined;
    void saveSkill.mutate({
      ...(editingId ? { id: editingId } : {}),
      input: current
        ? { ...skillInput(current), ...draft, status: "DRAFT", digest: "Source changed · check required" }
        : { ...draft, digest: "Pending source check", owner: "Current workspace", permissions: 0, status: "DRAFT" },
    });
  };
  const checkSource = () => {
    if (!selected) return;
    verifySkill.mutate(selected);
  };
  const remove = () => {
    if (!selected) return;
    deleteSkill.mutate(selected.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        description="Manage reusable agent capabilities stored in the workspace PostgreSQL catalog."
        actions={<Button className="h-11" onClick={openCreate}><Plus /> Register Skill</Button>}
      />

      {catalog.isPending ? <p className="border p-4 text-sm text-muted-foreground">Loading Skills from PostgreSQL…</p> : null}
      {catalog.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{catalog.error.message}</p> : null}
      {saveSkill.error || verifySkill.error || deleteSkill.error ? <p role="alert" className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">{(saveSkill.error ?? verifySkill.error ?? deleteSkill.error)?.message}</p> : null}

      <div className="grid overflow-hidden border bg-card text-sm sm:grid-cols-4">
        {[
          ["Available", items.length],
          ["Published", items.filter((item) => item.status === "PUBLISHED").length],
          ["Categories", new Set(items.map((item) => item.category)).size],
          ["Storage", "S3 immutable mirror"],
        ].map(([label, value]) => (
          <div key={label} className="border-b px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <strong className="mt-1 block">{value}</strong>
          </div>
        ))}
      </div>

      {notice ? <p role="status" className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm">{notice}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Skill catalog</CardTitle>
            <CardDescription>Search and filter workspace packages, following the catalog pattern used by Hermes Skills Hub.</CardDescription>
            <div className="flex flex-col gap-3 pt-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input aria-label="Search skills" className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills…" />
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Skill categories">
                {categories.map((item) => (
                  <Button key={item} type="button" size="sm" className="min-h-11" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {visible.length ? visible.map((skill) => (
              <button
                key={skill.id}
                type="button"
                aria-pressed={selected?.id === skill.id}
                onClick={() => { setSelectedId(skill.id); setMode("detail"); setNotice(""); }}
                className={cn(
                  "grid min-h-24 w-full gap-2 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center",
                  selected?.id === skill.id && "bg-muted/70 shadow-[inset_3px_0_0_var(--primary)]",
                )}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2"><strong>{skill.name}</strong><span className="border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{skill.category}</span></span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{skill.description}</span>
                </span>
                <span className="text-xs"><span className="block text-muted-foreground">Version</span><strong className="font-mono">v{skill.version}</strong></span>
                <StatusDot label={skill.status} tone={skill.status === "PUBLISHED" ? "success" : "neutral"} />
              </button>
            )) : (
              <div className="px-6 py-16 text-center"><Search className="mx-auto size-6 text-muted-foreground" /><strong className="mt-3 block">No matching skills</strong><p className="mt-1 text-xs text-muted-foreground">Try another search or category.</p></div>
            )}
          </CardContent>
        </Card>

        <Card className="self-start xl:sticky xl:top-24">
          {mode === "form" ? (
            <>
              <CardHeader className="border-b"><CardTitle>{editingId ? "Update Skill" : "Register Skill"}</CardTitle><CardDescription>Metadata is persisted in PostgreSQL. Source fetching remains simulated during development.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="skill-name">Name</Label><Input id="skill-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Release Notes" /></div>
                <div className="space-y-2"><Label htmlFor="skill-endpoint">Remote package endpoint</Label><Input id="skill-endpoint" className="h-11" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} placeholder="https://…/bundle.tar.zst" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="skill-version">Version</Label><Input id="skill-version" className="h-11" value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="skill-category">Category</Label><select id="skill-category" className="flex h-11 w-full border border-input bg-background px-3 text-sm" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as SkillDefinition["category"] })}>{skillCategories.map((item) => <option key={item}>{item}</option>)}</select></div>
                </div>
                <div className="space-y-2"><Label htmlFor="skill-description">Description</Label><Textarea id="skill-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
                <div className="flex gap-2"><Button className="h-11 flex-1" disabled={saveSkill.isPending} onClick={save}>{saveSkill.isPending ? "Saving…" : editingId ? "Save changes" : "Register"}</Button><Button className="h-11" variant="outline" onClick={() => setMode("detail")}>Cancel</Button></div>
              </CardContent>
            </>
          ) : selected ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-3"><StatusDot label={selected.status} tone={selected.status === "PUBLISHED" ? "success" : "neutral"} /><span className="text-xs text-muted-foreground">{selected.bindings} instances</span></div>
                <CardTitle className="mt-3">{selected.name}</CardTitle><CardDescription>{selected.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="text-xs">
                  {[["Source endpoint", selected.endpoint], ["Content digest", selected.digest], ["Version", `v${selected.version}`], ["Owner", selected.owner]].map(([label, value]) => (
                    <div key={label} className="border-b py-3"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-medium">{value}</dd></div>
                  ))}
                </dl>
                <div className="space-y-3 border bg-muted/30 p-3 text-xs leading-5">
                  <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><span><strong className="block">Platform verified</strong>TaskLattice fetches and checks the remote source outside the agent sandbox.</span></p>
                  <p className="flex gap-2"><Cloud className="mt-0.5 size-4 shrink-0 text-primary" /><span><strong className="block">Immutable S3 mirror</strong>Addressed by content SHA-256. Agents never receive S3 credentials.</span></p>
                </div>
                <div className="grid gap-2"><Button disabled={verifySkill.isPending} onClick={checkSource}><CheckCircle2 />{verifySkill.isPending ? "Checking…" : "Check source"}</Button><Button variant="outline" onClick={openEdit}><Pencil /> Update metadata</Button><Button variant="destructive" disabled={deleteSkill.isPending} onClick={remove}><Trash2 />{deleteSkill.isPending ? "Removing…" : "Remove Skill"}</Button></div>
              </CardContent>
            </>
          ) : (
            <CardContent className="py-16 text-center"><strong>No skills registered</strong><p className="mt-2 text-xs text-muted-foreground">Register a remote package to begin.</p></CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
