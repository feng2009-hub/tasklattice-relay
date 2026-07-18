import { providerPresets, type ProviderPresetId } from "@tasklattice/contracts";
import { ServerCog } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProviderIcon({
  presetId,
  className,
}: {
  presetId: ProviderPresetId;
  className?: string;
}) {
  const normalized = presetId === "kimi-cn" || presetId === "kimi-global" ? "moonshot" : presetId;
  const preset = providerPresets.find((item) => item.id === normalized);
  if (!preset) return <ServerCog aria-hidden="true" className={cn("size-6", className)} />;
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-md border bg-background shadow-xs", className)}>
      <img src={preset.icon} alt="" className="size-7 rounded-[5px] object-contain" />
    </span>
  );
}
