import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  LoaderCircle,
  RefreshCw,
  ServerCog,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteProject,
  getProjectDeletionImpact,
} from "@/services/project";
import type {
  Project,
  ProjectDeletionSchedule,
} from "@/types/project";

function scheduledTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusVariant(status: string): "secondary" | "outline" | "destructive" {
  if (["READY", "REGISTERED", "VALIDATED", "HEALTHY"].includes(status)) {
    return "secondary";
  }
  if (["FAILED", "UNAVAILABLE", "NON_COMPLIANT"].includes(status)) {
    return "destructive";
  }
  return "outline";
}

export function DeleteProjectSheet({
  onOpenChange,
  onScheduled,
  open,
  project,
}: {
  onOpenChange: (open: boolean) => void;
  onScheduled: (schedule: ProjectDeletionSchedule) => void | Promise<void>;
  open: boolean;
  project: Project;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [schedule, setSchedule] = useState<ProjectDeletionSchedule | null>(null);
  const impact = useQuery({
    queryKey: ["project", project.id, "deletion-impact"],
    queryFn: () => getProjectDeletionImpact(project.id),
    enabled: open && !schedule,
    retry: 1,
  });
  const deletion = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: setSchedule,
  });

  useEffect(() => {
    if (open) return;
    setAcknowledged(false);
    setConfirmation("");
    setSchedule(null);
    deletion.reset();
  }, [open]);

  const confirmed =
    acknowledged && confirmation === project.name && impact.isSuccess;
  const finish = () => {
    if (!schedule) return;
    onOpenChange(false);
    void onScheduled(schedule);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (deletion.isPending) return;
        if (!next && schedule) {
          finish();
          return;
        }
        onOpenChange(next);
      }}
    >
      <SheetContent
        className="gap-0 data-[side=right]:w-full sm:data-[side=right]:max-w-lg"
        showCloseButton={!deletion.isPending}
      >
        {schedule ? (
          <DeletionScheduled
            projectName={project.name}
            schedule={schedule}
            onContinue={finish}
          />
        ) : (
          <>
            <SheetHeader className="border-b px-5 py-5 pr-14">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-5" />
                </span>
                <div className="min-w-0">
                  <SheetTitle>Schedule Project deletion</SheetTitle>
                  <SheetDescription className="mt-1 leading-5">
                    Review active resources before deleting <strong>{project.name}</strong>.
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {impact.isLoading ? <ImpactLoading /> : null}
              {impact.isError ? (
                <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-4" role="alert">
                  <p className="text-sm font-semibold text-destructive">
                    Resource review could not be loaded
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {impact.error.message}
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => void impact.refetch()}
                  >
                    <RefreshCw />
                    Retry
                  </Button>
                </div>
              ) : null}
              {impact.data ? (
                <div className="space-y-6">
                  <section aria-labelledby="deletion-timing-title">
                    <div className="flex gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3">
                      <Clock3 className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" />
                      <div>
                        <h3 id="deletion-timing-title" className="text-sm font-semibold">
                          Cleanup starts after a {impact.data.delayMinutes}-minute safety window
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Submitting immediately locks and removes this Project from navigation. A dedicated worker then destroys runtime and integration resources before the database cascade runs.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section aria-labelledby="active-resources-title">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h3 id="active-resources-title" className="text-sm font-semibold">
                          Active resources
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          These resources are still running or connected now.
                        </p>
                      </div>
                      <Badge variant={impact.data.activeResources.length ? "destructive" : "secondary"}>
                        {impact.data.activeResources.length}
                      </Badge>
                    </div>
                    {impact.data.activeResources.length ? (
                      <ul className="mt-3 max-h-64 divide-y overflow-y-auto border" aria-label="Active Project resources">
                        {impact.data.activeResources.map((resource) => (
                          <li key={`${resource.kind}:${resource.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                            <ServerCog className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-sm font-medium">{resource.name}</strong>
                              <span className="mt-0.5 block text-xs text-muted-foreground">{resource.kindLabel}</span>
                            </span>
                            <Badge variant={statusVariant(resource.status)}>{resource.status}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-3 flex gap-3 border bg-muted/20 px-4 py-3">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                        <p className="text-xs leading-5 text-muted-foreground">
                          No active runtime or connected service resources were found.
                        </p>
                      </div>
                    )}
                  </section>

                  <section aria-labelledby="cascade-scope-title">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h3 id="cascade-scope-title" className="text-sm font-semibold">
                          Cascade scope
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          All Project-owned configuration and data below will be removed.
                        </p>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {impact.data.totalResourceCount} total
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 border">
                      {impact.data.resourceCounts.map((resource, index) => (
                        <div
                          key={resource.kind}
                          className={`flex min-h-12 items-center justify-between gap-2 px-3 py-2 ${index === impact.data.resourceCounts.length - 1 && impact.data.resourceCounts.length % 2 === 1 ? "col-span-2 border-t" : `${index % 2 === 0 ? "border-r" : ""} ${index >= 2 ? "border-t" : ""}`}`}
                        >
                          <dt className="text-xs text-muted-foreground">{resource.label}</dt>
                          <dd className="font-mono text-xs font-semibold">{resource.count}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-2 flex gap-2 text-xs leading-5 text-muted-foreground">
                      <Database className="mt-0.5 size-3.5 shrink-0" />
                      Audit evidence is retained separately according to the existing retention policy.
                    </p>
                  </section>

                  <section className="space-y-4 border-t pt-5" aria-labelledby="confirm-project-deletion-title">
                    <div>
                      <h3 id="confirm-project-deletion-title" className="text-sm font-semibold">
                        Confirm deletion request
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        This request cannot be cancelled from the console after submission.
                      </p>
                    </div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-3 text-sm">
                      <input
                        className="mt-0.5 size-4 accent-destructive"
                        type="checkbox"
                        checked={acknowledged}
                        disabled={deletion.isPending}
                        onChange={(event) => setAcknowledged(event.target.checked)}
                      />
                      <span className="leading-5">
                        I understand that active resources will be stopped and Project-owned data will be permanently deleted.
                      </span>
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="delete-project-confirmation">
                        Type <strong>{project.name}</strong> to confirm.
                      </Label>
                      <Input
                        id="delete-project-confirmation"
                        className="h-11"
                        value={confirmation}
                        disabled={deletion.isPending}
                        autoComplete="off"
                        onChange={(event) => setConfirmation(event.target.value)}
                      />
                    </div>
                    {deletion.isError ? (
                      <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                        {deletion.error.message}
                      </p>
                    ) : null}
                  </section>
                </div>
              ) : null}
            </div>

            <SheetFooter className="flex-row border-t px-5 py-4">
              <Button
                className="h-11 flex-1"
                type="button"
                variant="outline"
                disabled={deletion.isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="h-11 flex-1"
                type="button"
                variant="destructive"
                disabled={!confirmed || deletion.isPending}
                onClick={() => deletion.mutate()}
              >
                {deletion.isPending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Trash2 />
                )}
                {deletion.isPending ? "Scheduling…" : "Schedule deletion"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ImpactLoading() {
  return (
    <div className="grid min-h-64 place-items-center text-center" role="status">
      <span>
        <LoaderCircle className="mx-auto size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        <span className="mt-3 block text-sm font-medium">Reviewing Project resources…</span>
        <span className="mt-1 block text-xs text-muted-foreground">Nothing has been deleted.</span>
      </span>
    </div>
  );
}

function DeletionScheduled({
  onContinue,
  projectName,
  schedule,
}: {
  onContinue: () => void;
  projectName: string;
  schedule: ProjectDeletionSchedule;
}) {
  return (
    <>
      <div className="grid flex-1 place-items-center px-6 py-10 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </span>
          <SheetTitle className="mt-5 text-xl">Deletion scheduled</SheetTitle>
          <SheetDescription className="mt-2 leading-6">
            <strong>{projectName}</strong> is now locked and has been removed from active Projects.
          </SheetDescription>
          <div className="mt-6 border bg-muted/20 px-4 py-4 text-left">
            <span className="text-xs text-muted-foreground">Cleanup begins around</span>
            <strong className="mt-1 block text-sm">{scheduledTime(schedule.scheduledFor)}</strong>
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">
              Runtime resources are stopped first, followed by integration cleanup and the database cascade.
            </span>
          </div>
        </div>
      </div>
      <SheetFooter className="border-t px-5 py-4">
        <Button className="h-11 w-full" type="button" onClick={onContinue}>
          Continue
        </Button>
      </SheetFooter>
    </>
  );
}
