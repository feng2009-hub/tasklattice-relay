import type { Agent, SandboxAuditEvent } from "@tasklattice/contracts";
import { AlertTriangle, CheckCircle2, Circle, FileText } from "lucide-react";
import { ProvisioningLog } from "@/components/agents/provisioning-log";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DetailCardHeader, RelativeTime } from "./instance-detail-shared";

export function InstanceActivityTab({ agent, auditError, auditEvents, auditLoading, showLogs }: {
  agent: Agent;
  auditError?: string;
  auditEvents?: SandboxAuditEvent[];
  auditLoading: boolean;
  showLogs: boolean;
}) {
  const lifecycle = [
    { id: "created", title: "Instance created", occurredAt: agent.createdAt, status: "success" as const, description: "The control plane accepted the Instance definition." },
    ...(agent.status === "READY" ? [{ id: "ready", title: "Instance ready", occurredAt: agent.updatedAt, status: "success" as const, description: "The OpenShell runtime reported the Instance ready." }] : []),
    ...(agent.status === "FAILED" ? [{ id: "failed", title: "Provisioning failed", occurredAt: agent.updatedAt, status: "error" as const, description: agent.error ?? "No failure summary was returned." }] : []),
  ];
  const events = [
    ...lifecycle,
    ...(auditEvents ?? []).map((event) => ({ id: event.id, title: event.summary, occurredAt: event.timestamp, status: event.decision === "DENIED" || event.decision === "BLOCKED" || event.decision === "REJECTED" ? "error" as const : "info" as const, description: `${event.source} · ${event.category} · ${event.decision}` })),
  ].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

  return (
    <div role="tabpanel" aria-label="Activity" className="space-y-4 pt-5">
      <Card>
        <DetailCardHeader title="Activity" description="Lifecycle facts and observed Sandbox audit events." />
        <CardContent>
          {auditLoading && events.length <= 1 ? <p className="py-8 text-sm text-muted-foreground">Loading observed activity…</p> : null}
          {auditError ? <p role="alert" className="mb-4 flex gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Sandbox audit is unavailable: {auditError}</p> : null}
          <ol className="relative ml-2 border-l">
            {events.map((event) => {
              const Icon = event.status === "success" ? CheckCircle2 : event.status === "error" ? AlertTriangle : Circle;
              return (
                <li key={event.id} className="relative pb-6 pl-7 last:pb-0">
                  <span className={cn("absolute -left-[13px] top-0 grid size-6 place-items-center rounded-full bg-background", event.status === "success" ? "text-emerald-600" : event.status === "error" ? "text-destructive" : "text-primary")}><Icon className="size-4" /></span>
                  <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-medium">{event.title}</h3><span className="text-xs text-muted-foreground"><RelativeTime value={event.occurredAt} /></span></div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card id="provisioning-logs" className="scroll-mt-24">
        <details key={String(showLogs)} open={showLogs}>
          <summary className="list-none"><DetailCardHeader title="Provisioning logs" description="Open only when troubleshooting lifecycle progress or failure." action={<Button type="button" variant="outline" size="sm" tabIndex={-1}><FileText />{showLogs ? "Hide logs" : "View logs"}</Button>} /></summary>
          <CardContent className="pt-4"><ProvisioningLog lines={agent.logs} state={agent.status === "FAILED" ? "failed" : agent.status === "PROVISIONING" ? "live" : "complete"} /></CardContent>
        </details>
      </Card>
    </div>
  );
}
