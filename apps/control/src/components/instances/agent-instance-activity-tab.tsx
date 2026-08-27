import type { AgentInstanceDetail } from "@tali/contracts";
import { Activity, CheckCircle2, Radio } from "lucide-react";
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
          title="Registry discovery"
          description="How compatible Supervisors find this Instance through the Project Runtime Bridge."
        />
        <CardContent>
          <div className="flex min-h-36 flex-col items-center justify-center text-center">
            <Radio className="size-5 text-primary" />
            <strong className="mt-3 text-sm">
              {detail.status === "READY" && detail.capabilities.acceptsDelegation
                ? "Discoverable in this Project"
                : "Filtered from discovery"}
            </strong>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Discovery requires a READY Instance, a validated A2A Agent Card,
              and the accepts-delegation capability.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
