import { useState } from "react";
import type {
  AccessPolicy,
  CreateVirtualEmployeeInput,
  VirtualEmployee,
} from "@tasklattice/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bot, Check, ShieldCheck } from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";

export function normalizeVirtualEmployeeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function policyStatus(policy: AccessPolicy): string {
  return policy.status === "ACTIVE" ? "Active" : "Draft";
}

export function CreateVirtualEmployeeSheet({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated?: (employee: VirtualEmployee) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [policyId, setPolicyId] = useState("");
  const policies = useQuery({
    queryKey: scope.key("access-policies"),
    queryFn: api.listAccessPolicies,
    enabled: open,
  });
  const selectedPolicy = policies.data?.find((policy) => policy.id === policyId);
  const identifier = normalizeVirtualEmployeeName(name);

  const reset = () => {
    setName("");
    setPolicyId("");
    create.reset();
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedPolicy) throw new Error("Select an Access Policy.");
      const input: CreateVirtualEmployeeInput = {
        name: identifier,
        displayName: name.trim(),
        description: "",
        environment: "production",
        tags: [],
        identities: [],
        accessScopes: [],
        activate: true,
      };
      const employee = await api.createVirtualEmployee(input);
      try {
        await api.updateAccessPolicy(selectedPolicy.id, {
          virtualEmployeeIds: [
            ...new Set([...selectedPolicy.virtualEmployeeIds, employee.id]),
          ],
        });
      } catch (error) {
        await api.deleteVirtualEmployee(employee.id).catch(() => undefined);
        throw error;
      }
      return employee;
    },
    onSuccess: async (employee) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: scope.key("virtual-employees"),
        }),
        queryClient.invalidateQueries({
          queryKey: scope.key("access-policies"),
        }),
        queryClient.invalidateQueries({
          queryKey: ["project", employee.projectId, "members"],
        }),
      ]);
      reset();
      onOpenChange(false);
      onCreated?.(employee);
    },
  });

  const close = () => {
    if (create.isPending) return;
    reset();
    onOpenChange(false);
  };

  const canConfirm =
    identifier.length >= 2 && Boolean(selectedPolicy) && !policies.isPending;

  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
      width="md"
      eyebrow="Security"
      title="Create Virtual Employee"
      description="Create a Project-scoped permission identity and bind it to an existing Access Policy."
      footer={(
        <>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            disabled={!canConfirm || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Spinner /> : <ShieldCheck />}
            {create.isPending ? "Creating…" : "Confirm"}
          </Button>
        </>
      )}
    >
      <div className="space-y-7">
        <div className="space-y-2">
          <Label htmlFor="virtual-employee-name">Name</Label>
          <Input
            id="virtual-employee-name"
            className="h-11"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              create.reset();
            }}
            placeholder="Research Assistant"
            required
            autoFocus
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Used as the Virtual Employee identity inside this Project.
            {name.trim() && identifier !== name.trim() ? (
              <> Identifier: <span className="font-mono">{identifier || "invalid"}</span>.</>
            ) : null}
          </p>
        </div>

        <section className="space-y-3" aria-labelledby="binding-policy-heading">
          <div>
            <Label id="binding-policy-heading" htmlFor="binding-policy">
              Binding Policy
            </Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Determines which discovered MCP tools this Virtual Employee may invoke.
            </p>
          </div>
          {policies.isError ? (
            <div
              className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              <p>{policies.error.message}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void policies.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : policies.isPending ? (
            <div className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading Access Policies…
            </div>
          ) : policies.data.length ? (
            <Select
              value={policyId}
              onValueChange={(value) => {
                setPolicyId(value);
                create.reset();
              }}
            >
              <SelectTrigger id="binding-policy" className="h-11 w-full">
                <SelectValue placeholder="Select an Access Policy" />
              </SelectTrigger>
              <SelectContent>
                {policies.data.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.name} · {policyStatus(policy)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="border border-dashed p-4 text-sm">
              <strong className="block">No Access Policies available</strong>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Create a policy before adding a Virtual Employee.
              </p>
              <Button className="mt-3" size="sm" variant="outline" asChild>
                <Link
                  to="/$projectId/access-policies"
                  params={{ projectId: scope.projectId }}
                >
                  Open Access Policies
                </Link>
              </Button>
            </div>
          )}
        </section>

        <section className="border-t pt-5" aria-labelledby="employee-review-heading">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Check className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="employee-review-heading" className="text-sm font-semibold">
                Review
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Confirm the identity and its effective permission boundary.
              </p>
            </div>
          </div>
          <dl className="mt-4 divide-y border-y text-sm">
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{name.trim() || "Not entered"}</dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Binding Policy</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium">
                {selectedPolicy ? (
                  <>
                    <span>{selectedPolicy.name}</span>
                    <Badge variant="outline">{policyStatus(selectedPolicy)}</Badge>
                  </>
                ) : (
                  "Not selected"
                )}
              </dd>
            </div>
          </dl>
          {selectedPolicy?.status === "DRAFT" ? (
            <p className="mt-3 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs leading-5">
              This policy is Draft and will not grant runtime access until it is activated.
            </p>
          ) : null}
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <Bot className="mt-0.5 size-4 shrink-0" />
            Model selection and Runtime Policy are configured when an Instance is created.
          </p>
        </section>

        {create.error ? (
          <p
            role="alert"
            className="border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive"
          >
            {create.error.message}
          </p>
        ) : null}
      </div>
    </EntitySheet>
  );
}
