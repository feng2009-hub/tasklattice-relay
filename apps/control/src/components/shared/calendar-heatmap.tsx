import type { FC } from "react";
import {
  ResponsiveCalendar,
  type CalendarDatum,
  type CalendarTooltipProps,
} from "@nivo/calendar";
import { cn } from "@/lib/utils";
import { nivoChartTheme } from "./nivo-theme";

export function resolveCalendarMaxValue(maxValue: number) {
  return maxValue > 0 ? maxValue : 1;
}

export function CalendarHeatmap({
  ariaLabel,
  colors,
  data,
  from,
  legendFormat,
  maxValue,
  to,
  tooltip,
  className,
}: {
  ariaLabel: string;
  colors: string[];
  data: CalendarDatum[];
  from: string;
  legendFormat: (value: number) => string;
  maxValue: number;
  to: string;
  tooltip: FC<CalendarTooltipProps>;
  className?: string;
}) {
  return (
    <figure aria-label={ariaLabel} className="min-w-0">
      <div className="overflow-x-auto overscroll-x-contain">
        <div
          aria-hidden="true"
          className={cn(
            "h-[220px] min-w-[720px] w-full xl:h-[260px] 2xl:h-[300px]",
            className,
          )}
        >
          <ResponsiveCalendar
            data={data}
            from={from}
            to={to}
            align="center"
            colors={colors}
            minValue={0}
            maxValue={resolveCalendarMaxValue(maxValue)}
            emptyColor="var(--cost-calendar-outside)"
            margin={{ top: 22, right: 12, bottom: 48, left: 12 }}
            yearLegend={() => ""}
            yearLegendOffset={0}
            monthLegendOffset={10}
            monthBorderWidth={0}
            monthSpacing={3}
            daySpacing={2}
            dayBorderWidth={1}
            dayBorderColor="var(--border)"
            tooltip={tooltip}
            legendFormat={legendFormat}
            legends={[{
              anchor: "bottom-right",
              direction: "row",
              translateY: -24,
              itemCount: colors.length,
              itemWidth: 72,
              itemHeight: 14,
              itemsSpacing: 2,
              symbolSize: 10,
            }]}
            role="presentation"
            theme={nivoChartTheme}
          />
        </div>
      </div>
      <figcaption className="sr-only">{ariaLabel}</figcaption>
    </figure>
  );
}
