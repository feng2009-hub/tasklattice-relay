import type { AgentPlatformId } from "@tasklattice/contracts";
import { Bot, Check } from "lucide-react";
import { agentPlatformPresentations } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";

export function AgentPlatformPicker({
  onValueChange,
  value,
}: {
  onValueChange: (value: AgentPlatformId) => void;
  value: AgentPlatformId;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Agent platform</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        NemoClaw provisions the selected Agent implementation inside the same
        OpenShell isolation boundary.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {agentPlatformPresentations.map((platform) => {
          const selected = platform.id === value;
          return (
            <label
              key={platform.id}
              className={cn(
                "relative grid min-h-32 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border p-4 transition-colors hover:bg-muted/45 focus-within:outline-2 focus-within:outline-offset-2",
                selected &&
                  "border-primary bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
              )}
            >
              <input
                type="radio"
                name="agent-platform"
                value={platform.id}
                checked={selected}
                onChange={() => onValueChange(platform.id)}
                className="sr-only"
              />
              <span className="grid size-10 place-items-center border bg-background">
                {platform.brandAsset ? (
                  <img
                    src={platform.brandAsset}
                    alt=""
                    className="size-7 object-contain"
                  />
                ) : (
                  <Bot className="size-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{platform.name}</strong>
                  {platform.isDefault ? (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {platform.description}
                </span>
                <span className="mt-2 block font-mono text-[10px] text-muted-foreground">
                  NemoClaw · {platform.terminalLabel}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 place-items-center rounded-full border",
                  selected &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {selected ? <Check className="size-3.5" /> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
