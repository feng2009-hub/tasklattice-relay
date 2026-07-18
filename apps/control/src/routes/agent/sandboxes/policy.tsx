import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SandboxPolicy } from "@tasklattice/contracts";
import { AlertTriangle, FileLock2, LockKeyhole, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PolicyEditorDrawer } from "@/components/policies/policy-editor-drawer";
import { StatusDot } from "@/components/shared/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agent/sandboxes/policy")({ component: PolicyPage });

function PolicyPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<{ open: boolean; policy?: SandboxPolicy }>({ open: false });
  const catalog = useQuery({ queryKey: ["sandbox-policies"], queryFn: api.listPolicies });
  const selected = catalog.data?.policies.find((policy) => policy.id === selectedId)
    ?? catalog.data?.policies.find((policy) => policy.id === catalog.data.defaultPolicyId)
    ?? catalog.data?.policies[0];
  const remove = useMutation({
    mutationFn: api.deletePolicy,
    onSuccess: async () => {
      setSelectedId(catalog.data?.defaultPolicyId ?? "");
      await queryClient.invalidateQueries({ queryKey: ["sandbox-policies"] });
    },
  });

  useEffect(() => {
    if (!selectedId && catalog.data?.defaultPolicyId)
      setSelectedId(catalog.data.defaultPolicyId);
  }, [catalog.data?.defaultPolicyId, selectedId]);

  const deleteSelected = () => {
    if (!selected || selected.immutable) return;
    if (window.confirm(`Delete the custom Policy “${selected.name}”?`)) remove.mutate(selected.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy"
        description="Manage reusable OpenShell boundaries. Built-in policies come from the deployment ConfigMap; custom policies are managed here."
        actions={<Button className="h-11" onClick={() => setEditor({ open: true })}><Plus />Create Policy</Button>}
      />
      {catalog.error ? (
        <div role="alert" className="flex min-h-28 items-center justify-between gap-4 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{catalog.error.message}</span>
          <Button variant="outline" onClick={() => void catalog.refetch()}>Retry</Button>
        </div>
      ) : catalog.isPending ? (
        <div className="flex min-h-64 items-center justify-center gap-3 border text-sm text-muted-foreground"><Spinner />Loading Policy catalog…</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Available policies</CardTitle>
              <CardDescription>Each Instance resolves a catalog entry, then passes the validated YAML to OpenShell at Sandbox creation.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {catalog.data?.policies.map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  aria-pressed={selected?.id === policy.id}
                  onClick={() => setSelectedId(policy.id)}
                  className={cn(
                    "grid min-h-20 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                    selected?.id === policy.id && "bg-muted/70 shadow-[inset_3px_0_0_var(--foreground)]",
                  )}
                >
                  <FileLock2 className="size-4 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{policy.name}</strong>
                      {policy.id === catalog.data.defaultPolicyId ? <Badge variant="secondary">Default</Badge> : null}
                      <Badge variant="outline">{policy.source === "BUILT_IN" ? "Built-in" : "Custom"}</Badge>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{policy.description}</span>
                  </span>
                  <StatusDot label={policy.enforcement} tone="success" />
                </button>
              ))}
            </CardContent>
          </Card>
          {selected ? (
            <Card className="xl:sticky xl:top-24">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-3">
                  <StatusDot label={selected.enforcement} tone="success" />
                  <span className="font-mono text-xs text-muted-foreground">{selected.id}</span>
                </div>
                <CardTitle className="mt-3">{selected.name}</CardTitle>
                <CardDescription>{selected.networkAccess}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected.immutable ? (
                  <p className="flex items-start gap-2 border-l-2 border-primary bg-primary/5 px-3 py-3 text-xs leading-5">
                    <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                    Managed by the deployment ConfigMap. Built-in policies cannot be edited or deleted in the console.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setEditor({ open: true, policy: selected })}><Pencil />Edit</Button>
                    <Button variant="outline" className="flex-1 text-destructive" disabled={remove.isPending} onClick={deleteSelected}><Trash2 />Delete</Button>
                  </div>
                )}
                <pre className="max-h-[420px] overflow-auto border bg-muted/45 p-4 font-mono text-[11px] leading-5"><code>{selected.policyYaml}</code></pre>
                <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  Provider-composed inference access remains managed by OpenShell; this policy controls additional Sandbox access.
                </p>
                {selected.id === catalog.data?.defaultPolicyId ? (
                  <p className="flex items-start gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-xs leading-5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    The default policy permits arbitrary shell and file operations in Sandbox-owned writable paths. OpenShell still rejects root execution and globally wildcarded network egress.
                  </p>
                ) : null}
                {remove.error ? <p role="alert" className="text-sm text-destructive">{remove.error.message}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
      <PolicyEditorDrawer
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        policy={editor.policy}
        templatePolicyYaml={catalog.data?.templatePolicyYaml ?? ""}
        onSaved={(policy) => setSelectedId(policy.id)}
      />
    </div>
  );
}
