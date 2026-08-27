import type { AgentInstanceDetail } from "@tali/contracts";
import { Activity, CheckCircle2, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DetailCardHeader, RelativeTime } from "./instance-detail-shared";

export function AgentInstanceActivityTab({
  detail,
}: {
  detail: AgentInstanceDetail;
}) {
  const lifecycleLogs = detail.instance.logs.slice().reverse();
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)]">
      <Card>
        <DetailCardHeader
          title="Lifecycle Activity"
          description="Runtime reconciliation and platform events for this Agent Instance."
        />
        <CardContent>
          <ol className="space-y-0">
            <li className="relative flex gap-3 border-b py-4">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Activity className="size-4" />
              </span>
              <div className="min-w-0">
                <strong className="text-sm">Agent Instance created</strong>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {detail.runtimeView.type} runtime registered <RelativeTime value={detail.createdAt} />.
                </p>
              </div>
            </li>
            {lifecycleLogs.length ? lifecycleLogs.map((entry, index) => (
              <li key={`${index}-${entry}`} className="relative flex gap-3 border-b py-4 last:border-b-0">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <strong className="text-sm">Runtime event</strong>
                  <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{entry}</p>
                </div>
              </li>
            )) : null}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <DetailCardHeader
          title="Connections"
          description="Coordinator relationships that can produce A2A invocations."
        />
        <CardContent>
          {detail.connections.length ? (
            <div className="space-y-3">
              {detail.connections.map((connection) => (
                <div key={connection.id} className="border bg-muted/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 font-mono text-xs">
                      <Link2 className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{connection.coordinatorInstanceId}</span>
                    </span>
                    <Badge variant="outline">
                      {connection.approvalMode === "AUTO_READ_ONLY" ? "Auto read-only" : "Always ask"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Connected <RelativeTime value={connection.createdAt} />
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-36 flex-col items-center justify-center text-center">
              <Link2 className="size-5 text-muted-foreground" />
              <strong className="mt-3 text-sm">No Coordinator connection</strong>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The Agent is registered, but no Supervisor is authorized to delegate to it.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
