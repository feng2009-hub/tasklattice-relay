import { Check, ChevronDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { PermissionItem } from "@/features/account/permission-groups";
import { cn } from "@/lib/utils";

export function ProjectPermissionLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
      aria-label="Permission status legend"
    >
      <span className="inline-flex items-center gap-1.5">
        <Check className="size-3.5 text-emerald-700 dark:text-emerald-300" />
        Enabled
      </span>
      <span className="inline-flex items-center gap-1.5">
        <X className="size-3.5 text-destructive" />
        Disabled
      </span>
    </div>
  );
}

export function ProjectPermissionGroup({
  defaultOpen = false,
  description,
  items,
  title,
}: {
  defaultOpen?: boolean;
  description: string;
  items: readonly PermissionItem[];
  title: string;
}) {
  const enabledCount = items.filter((item) => item.enabled).length;

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/permission overflow-hidden rounded-md border"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
        >
          <span className="min-w-0 flex-1">
            <strong className="block font-sans text-sm font-semibold">
              {title}
            </strong>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {description}
            </span>
          </span>
          <Badge
            variant="secondary"
            className="font-mono text-[10px] tabular-nums"
            aria-label={`${enabledCount} of ${items.length} permissions enabled`}
          >
            {enabledCount}/{items.length}
          </Badge>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/permission:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-x-6 gap-y-2 border-t bg-muted/15 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ capability, enabled }) => (
            <li key={capability} className="flex min-w-0 items-start gap-2">
              {enabled ? (
                <Check
                  aria-label="Enabled"
                  className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
                />
              ) : (
                <X
                  aria-label="Disabled"
                  className="mt-0.5 size-3.5 shrink-0 text-destructive"
                />
              )}
              <code
                className={cn(
                  "break-all font-mono text-[11px] leading-5",
                  enabled ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {capability}
              </code>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
