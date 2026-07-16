import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const ansiPattern = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export function ProvisioningLog({
  lines,
  state = "live",
}: {
  lines: string[];
  state?: "complete" | "failed" | "live";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const sanitizedLines = lines.map((line) => line.replace(ansiPattern, ""));
  const latestLine = sanitizedLines.at(-1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && followRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [lines]);

  return (
    <section className="overflow-hidden border bg-zinc-950 text-zinc-300" aria-label="Initialization log">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-zinc-800 px-4 text-[11px]">
        <span className="font-medium text-zinc-200">Initialization log</span>
        <span className={cn("inline-flex items-center gap-1.5", state === "failed" ? "text-red-400" : "text-zinc-500")}>
          {state === "live" ? <Spinner className="size-3" /> : null}
          {state === "live" ? "Live" : state === "failed" ? "Stopped" : "Complete"} · {lines.length} events
        </span>
      </div>
      <div
        ref={viewportRef}
        onScroll={(event) => {
          const viewport = event.currentTarget;
          followRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32;
        }}
        className="max-h-72 min-h-40 overflow-y-auto p-4 font-mono text-xs leading-6"
      >
        {sanitizedLines.length ? sanitizedLines.map((line, index) => (
          <div key={`${index}-${line}`} className={cn("flex gap-4 whitespace-pre-wrap break-words", index === sanitizedLines.length - 1 && state === "live" && "text-white")}>
            <span className="shrink-0 text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0">{line}</span>
          </div>
        )) : (
          <div className="flex min-h-28 items-center justify-center gap-2 text-zinc-500">
            {state === "live" ? <Spinner className="size-3.5" /> : null}
            Waiting for the first runtime event…
          </div>
        )}
        <p className="sr-only" aria-live="polite">{latestLine}</p>
      </div>
    </section>
  );
}
