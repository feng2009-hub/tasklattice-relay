import { useState } from "react";
import type { CostBreakdownItem, CostGroupBy } from "@tasklattice/contracts";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { costGroupLabels, usd } from "./cost-utils";
import { CostEmptyState } from "./cost-states";

function RankingList({
  items,
  selectedId,
  onSelect,
}: {
  items: CostBreakdownItem[];
  selectedId: string | undefined;
  onSelect: (item: CostBreakdownItem) => void;
}) {
  const max = items[0]?.spend ?? 0;
  return (
    <div className="divide-y">
      {items.map((item, index) => (
        <button
          type="button"
          key={item.id}
          className={cn(
            "grid min-h-14 w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-2 focus-visible:outline-inset",
            selectedId === item.id && "bg-accent",
          )}
          onClick={() => onSelect(item)}
        >
          <span className="font-mono text-[11px] text-muted-foreground">{index + 1}</span>
          <span className="min-w-0">
            <span className="flex items-center justify-between gap-3">
              <strong className="truncate text-xs font-medium">{item.label}</strong>
              <span className="shrink-0 text-[11px] text-muted-foreground">{(item.share * 100).toFixed(1)}%</span>
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-[color:var(--brand-signal)]"
                style={{ width: `${max > 0 ? Math.max(2, (item.spend / max) * 100) : 0}%` }}
              />
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold tabular-nums">
            {usd(item.spend)}
            <ChevronRight className="size-3 text-muted-foreground" />
          </span>
        </button>
      ))}
    </div>
  );
}

export function TopSpendRanking({
  groupBy,
  items,
  selectedId,
  onSelect,
}: {
  groupBy: CostGroupBy;
  items: CostBreakdownItem[];
  selectedId: string | undefined;
  onSelect: (item: CostBreakdownItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const title = `Top spend by ${costGroupLabels[groupBy]}`;
  return (
    <>
      <section aria-labelledby="top-spend-title" className="overflow-hidden rounded-lg border">
        <div className="flex min-h-12 items-center justify-between border-b px-4 py-2">
          <h2 id="top-spend-title" className="font-heading text-base font-medium">{title}</h2>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={!items.length}>View all</Button>
        </div>
        {items.length
          ? <RankingList items={items.slice(0, 5)} selectedId={selectedId} onSelect={onSelect} />
          : <CostEmptyState compact />}
      </section>
      <Drawer direction="right" open={open} onOpenChange={setOpen}>
        <DrawerContent className="ml-auto h-full w-full max-w-xl">
          <DrawerHeader className="border-b">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>All active {costGroupLabels[groupBy]}s ranked by USD spend.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto">
            <RankingList items={items} selectedId={selectedId} onSelect={(item) => { onSelect(item); setOpen(false); }} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
