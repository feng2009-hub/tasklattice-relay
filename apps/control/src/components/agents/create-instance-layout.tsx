import type { ReactNode } from "react";
import { Check, LockKeyhole, type LucideIcon } from "lucide-react";
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
        <ol className="grid grid-cols-2 gap-px border bg-border xl:grid-cols-4">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const complete = index < currentStep;
            return (
              <li key={step.label} className="bg-card">
                <button
                  type="button"
                  disabled={index > currentStep}
                  onClick={() => onStepChange(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] sm:min-h-20 sm:px-4",
                    active && "bg-primary text-primary-foreground",
                    complete && "hover:bg-muted",
                    index > currentStep && "cursor-not-allowed text-muted-foreground/55",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs",
                      complete && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary-foreground/40 bg-primary-foreground/15",
                    )}
                  >
                    {complete ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <strong className="block font-medium">{step.label}</strong>
                    <span className={cn("mt-1 hidden text-xs sm:block", active ? "text-primary-foreground/75" : "text-muted-foreground")}>{step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex items-start gap-2 border-x border-b bg-muted/35 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
          Credentials stay attached to validated Providers and managed extension references.
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {children}
        {blueprint}
      </div>
    </div>
  );
}

export function InstanceBlueprint({ children }: { children: ReactNode }) {
  return (
    <aside>
      <Card className="xl:sticky xl:top-24">
        <CardHeader>
          <CardTitle className="text-base">Instance blueprint</CardTitle>
          <CardDescription>Live summary of the specialized Agent you are assembling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {children}
          <Separator />
          <p className="text-xs leading-5 text-muted-foreground">Runtime provisioning remains asynchronous. Extension installation and binding are not implemented in this preview.</p>
        </CardContent>
      </Card>
    </aside>
  );
}

export function BlueprintRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center border bg-muted/40"><Icon className="size-4 text-primary" /></span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="block truncate text-sm">{value}</strong>
      </span>
    </div>
  );
}
