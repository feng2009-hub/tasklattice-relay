import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { PreviewBadge } from "@/components/shared/preview-badge";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { skillPreviews, type SkillPreview } from "@/lib/preview-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/skills")({ component: Skills });

const emptyDraft = {
  category: "Developer Tools" as SkillPreview["category"],
  description: "",
  endpoint: "",
  name: "",
  version: "1.0.0",
};

function Skills() {
  const [items, setItems] = useState(skillPreviews);
  const [selectedId, setSelectedId] = useState(skillPreviews[0]!.id);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [mode, setMode] = useState<"detail" | "form">("detail");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState("");

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
    if (editingId) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId ? { ...item, ...draft, status: "DRAFT", digest: "Source changed · check required" } : item,
        ),
      );
      setSelectedId(editingId);
      setNotice("Skill metadata updated in this preview.");
    } else {
      const id = `skill-preview-${Date.now()}`;
      setItems((current) => [
        ...current,
        {
          ...draft,
          bindings: 0,
          digest: "Pending source check",
          id,
          owner: "Current workspace",
          permissions: 0,
          status: "DRAFT",
        },
      ]);
      setSelectedId(id);
      setNotice("Skill registered in this preview.");
    }
    setMode("detail");
  };
  const checkSource = () => {
    if (!selected) return;
    setItems((current) =>
      current.map((item) =>
        item.id === selected.id
          ? { ...item, digest: "sha256:preview…verified", status: "PUBLISHED" }
          : item,
      ),
    );
    setNotice("Source verified. The immutable S3 mirror is simulated only.");
  };
  const remove = () => {
    if (!selected) return;
    const remaining = items.filter((item) => item.id !== selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setMode("detail");
    setNotice("Skill removed from this preview.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills"
        badge={<PreviewBadge />}
        description="Discover reusable agent capabilities, register a remote package, and review its verified immutable cache metadata."
        actions={<Button className="h-11" onClick={openCreate}><Plus /> Register Skill</Button>}
      />

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
              <CardHeader className="border-b"><CardTitle>{editingId ? "Update Skill" : "Register Skill"}</CardTitle><CardDescription>Metadata and source verification are simulated locally.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="skill-name">Name</Label><Input id="skill-name" className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Release Notes" /></div>
                <div className="space-y-2"><Label htmlFor="skill-endpoint">Remote package endpoint</Label><Input id="skill-endpoint" className="h-11" value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} placeholder="https://…/bundle.tar.zst" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="skill-version">Version</Label><Input id="skill-version" className="h-11" value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="skill-category">Category</Label><select id="skill-category" className="flex h-11 w-full border border-input bg-background px-3 text-sm" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as SkillPreview["category"] })}><option>Data</option><option>Developer Tools</option><option>Research</option></select></div>
                </div>
                <div className="space-y-2"><Label htmlFor="skill-description">Description</Label><Textarea id="skill-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
                <div className="flex gap-2"><Button className="h-11 flex-1" onClick={save}>{editingId ? "Save changes" : "Register"}</Button><Button className="h-11" variant="outline" onClick={() => setMode("detail")}>Cancel</Button></div>
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
                <div className="grid gap-2"><Button onClick={checkSource}><CheckCircle2 /> Check source</Button><Button variant="outline" onClick={openEdit}><Pencil /> Update metadata</Button><Button variant="destructive" onClick={remove}><Trash2 /> Remove Skill</Button></div>
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
