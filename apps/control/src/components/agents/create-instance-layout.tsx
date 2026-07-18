import type { ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type CreateInstanceStep = {
  description: string;
  label: string;
};

export function CreateInstanceLayout({
  blueprint,
  children,
  currentStep,
  onStepChange,
  steps,
}: {
  blueprint: ReactNode;
  children: ReactNode;
  currentStep: number;
  onStepChange: (step: number) => void;
  steps: readonly CreateInstanceStep[];
}) {
  return (
    <div className="space-y-6">
      <section aria-label="Create Instance progress">
        <ol className="grid grid-cols-3 border-b">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const complete = index < currentStep;
            return (
              <li key={step.label} className="relative bg-background">
                <button
                  type="button"
                  disabled={index > currentStep}
                  onClick={() => onStepChange(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-20 w-full items-center gap-3 border-b-2 border-transparent px-2 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:px-4",
                    active && "border-primary",
                    complete && "hover:bg-muted",
                    index > currentStep && "cursor-not-allowed text-muted-foreground/55",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs",
                      complete && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {complete ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <strong className="block font-medium">{step.label}</strong>
                    <span className="mt-1 hidden text-xs text-muted-foreground md:block">{step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(17rem,1fr)]">
        {children}
        {blueprint}
      </div>
    </div>
  );
}

export function InstanceBlueprint({ children, footer, status = "Ready to configure" }: { children: ReactNode; footer?: ReactNode; status?: string }) {
  return (
    <aside>
      <Card className="xl:sticky xl:top-24">
        <CardHeader>
          <div className="flex items-center justify-between gap-3"><CardTitle className="whitespace-nowrap text-sm">Instance blueprint</CardTitle><Badge className="shrink-0 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">{status}</Badge></div>
          <CardDescription>Live summary of the specialized Agent you are assembling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {children}
          {footer ? <><Separator />{footer}</> : null}
        </CardContent>
      </Card>
    </aside>
  );
}

export function BlueprintRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-md border px-3 py-2.5">
      <span className="grid size-9 place-items-center border bg-muted/40"><Icon className="size-4 text-primary" /></span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="block truncate text-sm">{value}</strong>
      </span>
    </div>
  );
}
