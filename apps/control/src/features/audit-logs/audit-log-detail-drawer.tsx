import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import {
  Braces,
  CheckCircle2,
  CircleSlash2,
  FileJson2,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { auditActionLabel, titleCase } from "./audit-log-utils";

function OutcomeIcon({ outcome }: { outcome: PlatformAuditLogEvent["outcome"] }) {
  if (outcome === "success") return <CheckCircle2 className="size-4" />;
  if (outcome === "denied") return <CircleSlash2 className="size-4" />;
  return <TriangleAlert className="size-4" />;
}

function Fact({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 break-words text-sm", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}

function JsonAttachment({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const serialized = JSON.stringify(value, null, 2);
  if (!serialized) return null;

  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm font-medium hover:bg-muted/35 focus-visible:outline-2">
        <FileJson2 className="size-4 text-muted-foreground" />
        <span>{label}</span>
        <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
          {new TextEncoder().encode(serialized).length} B
        </span>
      </summary>
      <div className="border-t bg-muted/20 p-4">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-muted-foreground">
          {serialized}
        </pre>
      </div>
    </details>
  );
}

export function AuditLogDetailDrawer({
  event,
  onOpenChange,
  open,
}: {
  event: PlatformAuditLogEvent | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  if (!event) return null;
  const outcomeTone =
    event.outcome === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : event.outcome === "denied"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" autoFocus>
      <DrawerContent
        aria-label={`Audit event ${event.id}`}
        className="w-[min(94vw,42rem)]"
      >
        <DrawerHeader className="relative border-b pr-16">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Project audit event
          </div>
          <DrawerTitle className="mt-2 text-xl">
            {event.actor.name} {event.verb} {event.object.name}
          </DrawerTitle>
          <DrawerDescription className="font-mono text-xs">
            {event.id}
          </DrawerDescription>
          <DrawerClose asChild>
            <button
              type="button"
              className="absolute right-3 top-3 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"
              aria-label="Close audit event details"
            >
              <X className="size-5" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="border-b p-5" aria-labelledby="audit-event-summary">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={outcomeTone}>
                <OutcomeIcon outcome={event.outcome} />
                {titleCase(event.outcome)}
              </Badge>
              <Badge variant="outline">{auditActionLabel(event.action)}</Badge>
            </div>
            <h2 id="audit-event-summary" className="sr-only">Event summary</h2>
            <p className="mt-4 text-sm leading-6">{event.summary}</p>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Fact label="Time" value={formatPlatformDateTime(event.occurredAt, { timeStyle: "medium" })} />
              <Fact label="Actor" value={`${event.actor.name}${event.actor.email ? ` · ${event.actor.email}` : ""}`} />
              <Fact label="Authorization" value={`${titleCase(event.authorization.decision)} · ${titleCase(event.authorization.role)}`} />
              <Fact label="Actor type" value={titleCase(event.actor.type)} />
              <Fact label="Action" value={event.action} mono />
              <Fact label="Object" value={`${event.object.type} · ${event.object.name}`} />
            </dl>
          </section>

          <section className="border-b p-5" aria-labelledby="audit-request-context">
            <h2 id="audit-request-context" className="flex items-center gap-2 text-sm font-semibold">
              <Braces className="size-4 text-muted-foreground" />
              Request context
            </h2>
            <div className="mt-4 flex min-w-0 items-start gap-3 border bg-muted/20 px-3 py-3">
              <Badge variant="outline" className="font-mono">{event.request.method}</Badge>
              <code className="min-w-0 break-all text-xs leading-5">{event.request.route}</code>
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Fact label="Request ID" value={event.request.id} mono />
              <Fact label="IP address" value={event.request.ipAddress} mono />
              <Fact label="User agent" value={event.request.userAgent} />
              <Fact label="Object ID" value={event.object.id} mono />
            </dl>
          </section>

          {event.request.parameters || event.request.body !== undefined || event.metadata ? (
            <section aria-labelledby="audit-payload-attachments">
              <div className="border-b px-5 py-4">
                <h2 id="audit-payload-attachments" className="text-sm font-semibold">
                  Payload attachments
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expand an attachment to inspect the retained JSON.
                </p>
              </div>
              <div>
                {event.request.parameters ? <JsonAttachment label="Parameters" value={event.request.parameters} /> : null}
                {event.request.body !== undefined ? <JsonAttachment label="Request body" value={event.request.body} /> : null}
                {event.metadata ? <JsonAttachment label="Event metadata" value={event.metadata} /> : null}
              </div>
            </section>
          ) : null}
        </div>

        <DrawerFooter>
          <p className="text-xs leading-5 text-muted-foreground">
            Request metadata and redacted payloads are retained for review.
            Authorization headers, credentials, and secrets are excluded.
          </p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
