import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  actions?: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  title: string;
}

export function PageHeader({
  actions,
  badge,
  description,
  eyebrow,
  title,
}: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div>
        {eyebrow ? (
          <p className="text-xs font-medium text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <div className={cn("flex flex-wrap items-center gap-3", eyebrow && "mt-2")}>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
