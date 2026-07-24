import type { ModelProfileStatus as ModelProfileStatusValue } from "@tasklattice/contracts";
import { cn } from "@/lib/utils";

export function ModelProfileStatus({
  status,
}: {
  status: ModelProfileStatusValue;
}) {
  const ready = status === "READY";
  const warning =
    status === "DEGRADED" ||
    status === "DRAFT" ||
    status === "VALIDATING";
  const label =
    status === "READY"
      ? "Ready"
      : status === "VALIDATING"
        ? "Validating"
        : status === "DEGRADED"
          ? "Needs attention"
          : status.replaceAll("_", " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        ready
          ? "text-emerald-700"
          : warning
            ? "text-amber-700"
            : "text-destructive",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
