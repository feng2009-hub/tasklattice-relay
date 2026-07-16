import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, FileLock2, Plus, ShieldCheck } from "lucide-react";
import { sandboxPolicies, type SandboxPolicyId } from "@tasklattice/contracts";
import { PageHeader } from "@/components/layout/page-header";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agent/sandboxes/policy")({ component: PolicyPage });

function PolicyPage() {
  const [selectedId, setSelectedId] = useState<SandboxPolicyId>(sandboxPolicies[0].id);
  const selected = sandboxPolicies.find((policy) => policy.id === selectedId) ?? sandboxPolicies[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent / Sandboxes / OpenShell"
        title="Policy"
        description="Manage the OpenShell runtime policy assigned when an Agent sandbox is created. Static isolation is fixed at creation; network rules remain enforced by OpenShell."
        actions={<Button asChild className="h-11"><Link to="/agents/new"><Plus />Create Agent</Link></Button>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Available policies</CardTitle>
            <CardDescription>TaskLattice passes the selected YAML to <span className="font-mono">openshell sandbox create --policy</span>.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {sandboxPolicies.map((policy) => (
              <button
                key={policy.id}
                type="button"
                aria-pressed={selected.id === policy.id}
                onClick={() => setSelectedId(policy.id)}
                className={cn(
                  "grid min-h-20 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/45 focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                  selected.id === policy.id && "bg-muted/70 shadow-[inset_3px_0_0_var(--foreground)]",
                )}
              >
                <FileLock2 className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <strong className="block text-sm">{policy.name}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{policy.description}</span>
                </span>
                <StatusDot label={policy.enforcement} tone="success" />
              </button>
            ))}
          </CardContent>
        </Card>
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
            <pre className="max-h-[420px] overflow-auto border bg-muted/45 p-4 font-mono text-[11px] leading-5"><code>{selected.policyYaml}</code></pre>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Provider-composed inference access remains managed by OpenShell; this policy controls additional sandbox access.
            </p>
            {selected.id === "github-full-access" ? (
              <p className="flex items-start gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-xs leading-5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                This example permits every HTTP operation on api.github.com for gh and curl. OpenShell still rejects undeclared destinations and keeps its filesystem and process isolation.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
