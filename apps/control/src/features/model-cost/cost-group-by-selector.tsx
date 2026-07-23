import type { CostGroupBy } from "@tasklattice/contracts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const options: Array<{ value: CostGroupBy; label: string }> = [
  { value: "instance", label: "Instance" },
  { value: "model_endpoint", label: "Model endpoint" },
  { value: "provider_account", label: "Provider account" },
  { value: "virtual_key", label: "Virtual key" },
];

export function CostGroupBySelector({
  value,
  onValueChange,
}: {
  value: CostGroupBy;
  onValueChange: (value: CostGroupBy) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-x-auto">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Group by</span>
      <Tabs value={value} onValueChange={(next) => onValueChange(next as CostGroupBy)}>
        <TabsList className="h-9 shrink-0">
          {options.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
