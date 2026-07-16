import type { AgentStatus, ProvisioningStage } from "@tasklattice/contracts";
import { AlertTriangle, Check, Circle, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { ProvisioningLog } from "@/components/agents/provisioning-log";
import { provisioningStageDefinitions, resolveProvisioningState } from "@/components/agents/provisioning-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function ProvisioningActivity({
  action,
  error,
  logs,
  stage,
  status,
}: {
  action?: ReactNode;
  error?: string;
  logs: string[];
  stage?: ProvisioningStage;
  status: AgentStatus;
}) {
  const state = resolveProvisioningState({
    status,
    ...(stage ? { stage } : {}),
  });
  const live = status === "PROVISIONING";

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {live ? <Spinner className="size-4 text-primary" /> : status === "FAILED" ? <AlertTriangle className="size-4 text-destructive" /> : <ScrollText className="size-4" />}
              {state.statusLabel}
            </CardTitle>
            <CardDescription className="mt-2">{state.statusDescription}</CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-5 py-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="font-medium">Runtime initialization</span>
            <span className="tabular-nums text-muted-foreground">{state.progress}%</span>
          </div>
          <Progress
            value={state.progress}
            aria-label="Runtime initialization progress"
            aria-valuetext={`${state.statusLabel}, ${state.progress}%`}
            className="h-2"
          />
        </div>

        <ol className="grid gap-x-3 gap-y-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Provisioning milestones">
          {provisioningStageDefinitions.filter((item) => item.id !== "READY").map((item, index) => {
            const stepState = state.stepState(index);
            return (
              <li
                key={item.id}
                className={cn(
                  "grid min-h-14 grid-cols-[1rem_minmax(0,1fr)] gap-2 border-l-2 py-1 pl-3 text-xs",
                  stepState === "active" && "border-primary bg-primary/5",
                  stepState === "complete" && "border-emerald-500",
                  stepState === "failed" && "border-destructive bg-destructive/5",
                  stepState === "pending" && "border-border text-muted-foreground",
                )}
              >
                {stepState === "active" ? <Spinner className="mt-0.5 size-3.5 text-primary" /> : stepState === "complete" ? <Check className="mt-0.5 size-3.5 text-emerald-600" /> : stepState === "failed" ? <AlertTriangle className="mt-0.5 size-3.5 text-destructive" /> : <Circle className="mt-0.5 size-3.5" />}
                <span>
                  <strong className="block font-medium text-foreground">{item.label}</strong>
                  <span className="mt-0.5 block leading-4">{item.description}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {error ? (
          <p role="alert" className="flex items-start gap-2 border-l-2 border-destructive bg-destructive/5 px-3 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        <ProvisioningLog lines={logs} state={status === "FAILED" ? "failed" : live ? "live" : "complete"} />
      </CardContent>
    </Card>
  );
}
