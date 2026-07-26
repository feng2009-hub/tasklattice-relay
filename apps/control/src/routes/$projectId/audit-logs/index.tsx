import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import {
  ChevronRight,
  Download,
  Filter,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AuditLogDetailDrawer } from "@/features/audit-logs/audit-log-detail-drawer";
import {
  auditActionLabel,
  countAdvancedAuditFilters,
  defaultAuditLogFilters,
  filterAuditLogs,
  titleCase,
  type AuditLogFilters,
  type AuditTimeRange,
} from "@/features/audit-logs/audit-log-utils";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import {
  createCsv,
  createDownloadFilename,
  downloadCsv,
  type CsvColumn,
} from "@/lib/csv";
import { cn } from "@/lib/utils";
import { formatPlatformDateTime } from "@/lib/platform-preferences";

export const Route = createFileRoute("/$projectId/audit-logs/")({
  component: AuditLogsPage,
});

const timeRanges: Array<{ label: string; value: AuditTimeRange }> = [
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "All time", value: "all" },
];

const csvColumns = [
  { header: "Time", value: (event) => event.occurredAt },
  { header: "Actor", value: (event) => event.actor.name },
  { header: "Actor email", value: (event) => event.actor.email },
  { header: "Actor type", value: (event) => event.actor.type },
  { header: "Authorization role", value: (event) => event.authorization.role },
  { header: "Authorization decision", value: (event) => event.authorization.decision },
  { header: "Action", value: (event) => event.action },
  { header: "Verb", value: (event) => event.verb },
  { header: "Object type", value: (event) => event.object.type },
  { header: "Object ID", value: (event) => event.object.id },
  { header: "Object name", value: (event) => event.object.name },
  { header: "Outcome", value: (event) => event.outcome },
  { header: "Summary", value: (event) => event.summary },
  { header: "Request ID", value: (event) => event.request.id },
  { header: "Method", value: (event) => event.request.method },
  { header: "Route", value: (event) => event.request.route },
  { header: "IP address", value: (event) => event.request.ipAddress },
] as const satisfies readonly CsvColumn<PlatformAuditLogEvent>[];

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function OutcomeMark({ outcome }: { outcome: PlatformAuditLogEvent["outcome"] }) {
  const tone =
    outcome === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : outcome === "denied"
        ? "text-amber-800 dark:text-amber-300"
        : "text-destructive";
  const dot =
    outcome === "success"
      ? "bg-emerald-500"
      : outcome === "denied"
        ? "bg-amber-500"
        : "bg-destructive";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em]",
        tone,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {outcome}
    </span>
  );
}

function AuditFiltersPopover({
  events,
  filters,
  onChange,
}: {
  events: readonly PlatformAuditLogEvent[];
  filters: AuditLogFilters;
  onChange: (filters: AuditLogFilters) => void;
}) {
  const actors = uniqueBy(events, (event) => event.actor.id)
    .map((event) => event.actor)
    .sort((left, right) => left.name.localeCompare(right.name));
  const actions = [...new Set(events.map((event) => event.action))].sort();
  const objectTypes = [...new Set(events.map((event) => event.object.type))].sort();
  const activeCount = countAdvancedAuditFilters(filters);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-11">
          <Filter />
          Filters
          {activeCount ? (
            <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="w-[min(92vw,22rem)] overflow-y-auto p-4"
        style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Filter activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">Combine filters to narrow the audit trail.</p>
          </div>
          <SlidersHorizontal className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-4 grid gap-4">
          <label>
            <span className="mb-1.5 block text-xs text-muted-foreground">Actor</span>
            <Select value={filters.actorId} onValueChange={(actorId) => onChange({ ...filters, actorId })}>
              <SelectTrigger data-size="lg" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actors</SelectItem>
                {actors.map((actor) => <SelectItem key={actor.id} value={actor.id}>{actor.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs text-muted-foreground">Action</span>
            <Select value={filters.action} onValueChange={(action) => onChange({ ...filters, action })}>
              <SelectTrigger data-size="lg" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((action) => <SelectItem key={action} value={action}>{auditActionLabel(action)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs text-muted-foreground">Object type</span>
            <Select value={filters.objectType} onValueChange={(objectType) => onChange({ ...filters, objectType })}>
              <SelectTrigger data-size="lg" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All object types</SelectItem>
                {objectTypes.map((objectType) => <SelectItem key={objectType} value={objectType}>{objectType}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs text-muted-foreground">Outcome</span>
            <Select value={filters.outcome} onValueChange={(outcome) => onChange({ ...filters, outcome })}>
              <SelectTrigger data-size="lg" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full"
          disabled={!activeCount}
          onClick={() => onChange({
            ...filters,
            actorId: "all",
            action: "all",
            objectType: "all",
            outcome: "all",
          })}
        >
          <X />
          Clear advanced filters
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function RestrictedAuditLogs() {
  return (
    <section className="mx-auto max-w-xl rounded-lg border bg-background p-6" aria-labelledby="audit-logs-restricted">
      <ShieldCheck className="size-8 text-muted-foreground" />
      <h1 id="audit-logs-restricted" className="mt-4 font-heading text-2xl">
        Audit Logs are restricted
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Only Project administrators can review user activity, authorization
        decisions, and retained request metadata for this Project.
      </p>
    </section>
  );
}

function AuditLogsPage() {
  const { currentProject } = useProject();
  const permissions = useProjectPermissions(currentProject?.role);
  const scope = useProjectQueryScope();
  const [filters, setFilters] = useState(defaultAuditLogFilters);
  const [selectedEvent, setSelectedEvent] = useState<PlatformAuditLogEvent>();
  const logs = useQuery({
    queryKey: scope.key("audit-logs"),
    queryFn: api.listAuditLogs,
    enabled: permissions.canViewAuditLogs,
    staleTime: 30_000,
  });
  const filtered = useMemo(
    () => filterAuditLogs(logs.data ?? [], filters),
    [filters, logs.data],
  );

  if (!currentProject) {
    return <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading Project audit logs…</div>;
  }
  if (!permissions.canViewAuditLogs) return <RestrictedAuditLogs />;

  const exportLogs = () => {
    const filename = createDownloadFilename(
      [currentProject.name, "audit-logs", new Date().toISOString().slice(0, 10)],
      "csv",
    );
    downloadCsv(filename, createCsv(filtered, csvColumns));
  };
  const resetFilters = () => setFilters(defaultAuditLogFilters);
  const hasFilters =
    filters.query.trim() !== "" ||
    filters.timeRange !== defaultAuditLogFilters.timeRange ||
    countAdvancedAuditFilters(filters) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Review who performed an action, what changed, and whether authorization allowed it."
        badge={<Badge variant="outline" className="gap-1.5"><LockKeyhole />Admin only</Badge>}
        actions={
          <Button type="button" variant="outline" className="h-11" disabled={!filtered.length} onClick={exportLogs}>
            <Download />
            Export CSV
          </Button>
        }
      />

      <div className="flex items-start gap-3 border-l-2 border-primary bg-primary/5 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-5 text-muted-foreground">
          This is a read-only Project trail. Request bodies are stored as expandable
          attachments with credentials and secrets excluded.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="relative w-full lg:max-w-md lg:flex-1">
              <span className="sr-only">Search audit logs</span>
              <Search className="pointer-events-none absolute bottom-3.5 left-3 size-4 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder="Search actor, action, object, or request ID"
                className="h-11 pl-9"
              />
            </label>
            <div className="ml-auto flex w-full flex-wrap items-end justify-end gap-3 lg:w-auto">
              <label className="w-44">
                <span className="mb-1 block text-xs text-muted-foreground">Time range</span>
                <Select
                  value={filters.timeRange}
                  onValueChange={(timeRange) => setFilters({ ...filters, timeRange: timeRange as AuditTimeRange })}
                >
                  <SelectTrigger data-size="lg" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {timeRanges.map((range) => <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <AuditFiltersPopover events={logs.data ?? []} filters={filters} onChange={setFilters} />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="size-11"
                disabled={logs.isFetching}
                aria-label="Refresh audit logs"
                onClick={() => void logs.refetch()}
              >
                {logs.isFetching ? <Spinner /> : <RefreshCw />}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span aria-live="polite" className="tabular-nums">
              {logs.isPending ? "Loading events…" : `${filtered.length} of ${(logs.data ?? []).length} events`}
            </span>
            {hasFilters ? (
              <Button type="button" size="xs" variant="ghost" onClick={resetFilters}>
                <X />Clear filters
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="px-0">
          {logs.isPending ? (
            <div className="divide-y" aria-label="Loading audit events">
              {[0, 1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="grid min-h-16 grid-cols-[7rem_1fr_4rem] items-center gap-3 px-4 lg:min-h-11 lg:grid-cols-[10.5rem_1fr_7.25rem_1.4fr_5.5rem]"
                >
                  <span className="h-2.5 animate-pulse rounded-sm bg-muted" />
                  <span className="h-2.5 animate-pulse rounded-sm bg-muted/80" />
                  <span className="h-2.5 animate-pulse rounded-sm bg-muted/70" />
                </div>
              ))}
            </div>
          ) : logs.error ? (
            <div role="alert" className="m-5 border-l-2 border-destructive bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Audit events could not be loaded.</p>
              <p className="mt-1 text-xs text-muted-foreground">{logs.error.message}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void logs.refetch()}>
                <RefreshCw />Try again
              </Button>
            </div>
          ) : filtered.length ? (
            <>
              <div className="hidden min-h-8 grid-cols-[10.5rem_minmax(10rem,1fr)_7.25rem_minmax(14rem,1.4fr)_5.5rem_1.5rem] items-center gap-3 border-b bg-muted/20 px-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground lg:grid">
                <span>Time</span>
                <span>Authorized actor</span>
                <span>Verb</span>
                <span>Object</span>
                <span>Result</span>
                <span className="sr-only">Details</span>
              </div>
              <ol className="divide-y">
                {filtered.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className="group grid min-h-16 w-full grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-3 px-4 text-left transition-colors hover:bg-muted/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px] lg:min-h-11 lg:grid-cols-[10.5rem_minmax(10rem,1fr)_7.25rem_minmax(14rem,1.4fr)_5.5rem_1.5rem]"
                      aria-label={`Open audit details: ${event.summary}`}
                    >
                      <span className="min-w-0 py-2.5 lg:hidden">
                        <span className="flex items-center justify-between gap-3">
                          <time
                            dateTime={event.occurredAt}
                            className="font-mono text-[10px] tabular-nums text-muted-foreground"
                          >
                            {formatPlatformDateTime(event.occurredAt, {
                              dateStyle: "short",
                              timeStyle: "medium",
                            })}
                          </time>
                          <OutcomeMark outcome={event.outcome} />
                        </span>
                        <span className="mt-1.5 block truncate text-[11px] leading-4">
                          <strong className="font-medium">{event.actor.name}</strong>
                          <span className="mx-1.5 font-mono text-[10px] uppercase text-primary">
                            {event.verb}
                          </span>
                          <span className="text-muted-foreground">{event.object.type} / </span>
                          {event.object.name}
                        </span>
                      </span>
                      <time
                        dateTime={event.occurredAt}
                        className="hidden truncate font-mono text-[11px] tabular-nums text-muted-foreground lg:block"
                      >
                        {formatPlatformDateTime(event.occurredAt, {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </time>
                      <span
                        className="hidden min-w-0 truncate text-[11px] font-medium lg:block"
                        title={event.actor.email ?? titleCase(event.actor.type)}
                      >
                        {event.actor.name}
                      </span>
                      <span
                        className="hidden truncate font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-primary lg:block"
                        title={event.action}
                      >
                        {event.verb}
                      </span>
                      <span className="hidden min-w-0 truncate text-[11px] lg:block">
                        <span className="text-muted-foreground">
                          {event.object.type}
                          <span className="mx-1.5 text-border">/</span>
                        </span>
                        <span className="font-medium">{event.object.name}</span>
                      </span>
                      <span className="hidden lg:block">
                        <OutcomeMark outcome={event.outcome} />
                      </span>
                      <ChevronRight className="size-3.5 justify-self-end text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <Filter className="mx-auto size-7 text-muted-foreground" />
                <h2 className="mt-4 font-medium">No matching audit events</h2>
                <p className="mt-1 text-sm text-muted-foreground">Adjust the search, time range, or advanced filters.</p>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AuditLogDetailDrawer
        event={selectedEvent}
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(undefined);
        }}
      />
    </div>
  );
}
