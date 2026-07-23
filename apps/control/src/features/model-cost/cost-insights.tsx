import type { CostInsight } from "@tasklattice/contracts";
import { Activity, CalendarRange, Coins, Cpu, Gauge, Layers3 } from "lucide-react";
import { compactNumber, usd } from "./cost-utils";

const icons = {
  highest_spend_day: CalendarRange,
  average_daily_spend: Gauge,
  active_group: Layers3,
  active_model_endpoints: Cpu,
  most_expensive_provider: Coins,
  peak_tokens_day: Activity,
} as const;

function value(insight: CostInsight): string {
  if (insight.valueKind === "currency") return usd(insight.value);
  if (insight.valueKind === "tokens") return compactNumber(insight.value);
  return insight.value.toLocaleString();
}

export function CostInsights({ insights }: { insights: CostInsight[] }) {
  return (
    <section aria-labelledby="cost-insights-title" className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 id="cost-insights-title" className="font-heading text-base font-medium">Cost insights</h2>
      </div>
      <div className="divide-y px-4">
        {insights.map((insight) => {
          const Icon = icons[insight.id];
          return (
            <div key={insight.id} className="grid min-h-12 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-xs">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-muted-foreground">{insight.label}</span>
                {insight.subject ? <strong className="mt-0.5 block truncate font-medium">{insight.subject}</strong> : null}
              </span>
              <strong className="tabular-nums">{value(insight)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
