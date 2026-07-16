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
  const preset = providerPresets.find((item) => item.id === presetId);
  if (!preset) return <ServerCog aria-hidden="true" className={cn("size-6", className)} />;
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center border bg-background", className)}>
      <img src={preset.icon} alt="" className="size-6 object-contain" />
    </span>
  );
}
