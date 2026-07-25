import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AccessPolicy,
  AccessPolicyDecision,
  CreateAccessPolicyInput,
  McpServerDefinition,
  VirtualEmployee,
} from "@tasklattice/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bot, Check, ServerCog, ShieldCheck } from "lucide-react";

import { EntitySheet } from "@/components/shared/entity-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Draft = {
  name: string;
  description: string;
  selectedServerIds: string[];
  defaults: Record<string, "ALLOW" | "DENY">;
  decisions: Record<string, AccessPolicyDecision>;
  virtualEmployeeIds: string[];
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  selectedServerIds: [],
  defaults: {},
  decisions: {},
  virtualEmployeeIds: [],
};

function toolKey(serverId: string, toolName: string): string {
  return `${serverId}\u0000${toolName}`;
}

function draftFor(policy?: AccessPolicy): Draft {
  if (!policy) return emptyDraft;
  return {
    name: policy.name,
    description: policy.description,
    selectedServerIds: policy.serverRules.map((rule) => rule.mcpServerId),
    defaults: Object.fromEntries(
      policy.serverRules.map((rule) => [rule.mcpServerId, rule.defaultDecision]),
    ),
    decisions: Object.fromEntries(
      policy.serverRules.flatMap((rule) =>
        rule.tools.map((tool) => [
          toolKey(rule.mcpServerId, tool.toolName),
          tool.decision,
        ]),
      ),
    ),
    virtualEmployeeIds: policy.virtualEmployeeIds,
  };
}

export function AccessPolicyEditorSheet({
  onOpenChange,
  open,
  policy,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  policy?: AccessPolicy;
}) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFor(policy));
  const catalog = useQuery({
    queryKey: scope.key("resource-catalog"),
    queryFn: api.getResourceCatalog,
    enabled: open,
  });
  const employees = useQuery({
    queryKey: scope.key("virtual-employees"),
    queryFn: api.listVirtualEmployees,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setDraft(draftFor(policy));
      setStep(0);
    }
  }, [open, policy]);

  const selectedServers = useMemo(
    () => (catalog.data?.mcpServers ?? []).filter((server) =>
      draft.selectedServerIds.includes(server.id)),
    [catalog.data, draft.selectedServerIds],
  );
  const steps = ["Policy details", "MCP tools", "Bindings", "Review"];
  const mutation = useMutation({
    mutationFn: (status: "DRAFT" | "ACTIVE") => {
      const input: CreateAccessPolicyInput = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        status,
        virtualEmployeeIds: draft.virtualEmployeeIds,
        serverRules: selectedServers.map((server) => ({
          mcpServerId: server.id,
          defaultDecision: draft.defaults[server.id] ?? "DENY",
          tools: server.tools.flatMap((tool) => {
            const decision = draft.decisions[toolKey(server.id, tool.name)] ?? "INHERIT";
            return decision === "INHERIT" ? [] : [{ toolName: tool.name, decision }];
          }),
        })),
      };
      return policy
        ? api.updateAccessPolicy(policy.id, input)
        : api.createAccessPolicy(input);
    },
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scope.key("access-policies") }),
        queryClient.invalidateQueries({ queryKey: scope.key("access-policy", saved.id) }),
        queryClient.invalidateQueries({ queryKey: scope.key("access-policy-versions", saved.id) }),
      ]);
      onOpenChange(false);
    },
  });

  const canContinue =
    step === 0
      ? draft.name.trim().length >= 3 && draft.description.trim().length >= 10
      : step === 1
        ? selectedServers.length > 0 && selectedServers.every((server) => server.tools.length > 0)
        : true;

  function toggleServer(id: string) {
    setDraft((current) => ({
      ...current,
      selectedServerIds: current.selectedServerIds.includes(id)
        ? current.selectedServerIds.filter((value) => value !== id)
        : [...current.selectedServerIds, id],
      defaults: current.defaults[id]
        ? current.defaults
        : { ...current.defaults, [id]: "DENY" },
    }));
  }

  function toggleEmployee(id: string) {
    setDraft((current) => ({
      ...current,
      virtualEmployeeIds: current.virtualEmployeeIds.includes(id)
        ? current.virtualEmployeeIds.filter((value) => value !== id)
        : [...current.virtualEmployeeIds, id],
    }));
  }

  const loading = catalog.isLoading || employees.isLoading;
  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      width="xl"
      eyebrow="Security"
      title={policy ? "Edit Access Policy" : "Create Access Policy"}
      description="Define the MCP tools a Virtual Employee may invoke. Active rules are synchronized to every bound Instance key."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => step ? setStep(step - 1) : onOpenChange(false)}
          >
            {step ? <><ArrowLeft /> Back</> : "Cancel"}
          </Button>
          {step < steps.length - 1 ? (
            <Button disabled={!canContinue || loading} onClick={() => setStep(step + 1)}>
              Next: {steps[step + 1]} <ArrowRight />
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("DRAFT")}
              >
                Save as draft
              </Button>
              <Button
                disabled={mutation.isPending || !selectedServers.length}
                onClick={() => mutation.mutate("ACTIVE")}
              >
                <ShieldCheck />
                {mutation.isPending ? "Synchronizing…" : "Save & activate"}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Policy creation steps">
        {steps.map((label, index) => (
          <li
            key={label}
            className={cn(
              "border-t-2 pt-2 text-[11px]",
              index <= step ? "border-primary font-medium text-foreground" : "border-border text-muted-foreground",
            )}
          >
            <span className="mr-1 tabular-nums">{index + 1}.</span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center border text-sm text-muted-foreground">
          Loading discovered MCP tools and Virtual Employees…
        </div>
      ) : null}
      {!loading && step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Policy details</CardTitle>
            <CardDescription>Use a purpose-oriented name that remains clear in audit history.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Research read-only"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Permit approved research and document tools without mutation capabilities."
              />
            </Field>
            <p className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
              Approval gates are not part of this policy type. A request is either allowed or denied by LiteLLM.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!loading && step === 1 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select MCP servers</CardTitle>
              <CardDescription>Only servers with a successful tool discovery can be activated.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(catalog.data?.mcpServers ?? []).map((server) => (
                <ChoiceCard
                  key={server.id}
                  checked={draft.selectedServerIds.includes(server.id)}
                  onChange={() => toggleServer(server.id)}
                  title={server.name}
                  description={`${server.tools.length} discovered tools · ${server.status}`}
                  icon={server.logoUrl ? <img src={server.logoUrl} alt="" className="size-7 object-contain" /> : <ServerCog className="size-5" />}
                  disabled={!server.tools.length}
                />
              ))}
              {!catalog.data?.mcpServers.length ? (
                <p className="border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2">
                  Register and discover an MCP Server before creating an Access Policy.
                </p>
              ) : null}
            </CardContent>
          </Card>
          {selectedServers.map((server) => (
            <ServerRules
              key={server.id}
              server={server}
              defaultDecision={draft.defaults[server.id] ?? "DENY"}
              decisions={draft.decisions}
              onDefaultChange={(value) => setDraft((current) => ({
                ...current,
                defaults: { ...current.defaults, [server.id]: value },
              }))}
              onDecisionChange={(name, value) => setDraft((current) => ({
                ...current,
                decisions: { ...current.decisions, [toolKey(server.id, name)]: value },
              }))}
            />
          ))}
        </div>
      ) : null}

      {!loading && step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Virtual Employee bindings</CardTitle>
            <CardDescription>
              The policy applies to every Instance bound to a selected Virtual Employee. Unbound policies have no runtime effect.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {(employees.data ?? []).map((employee) => (
              <ChoiceCard
                key={employee.id}
                checked={draft.virtualEmployeeIds.includes(employee.id)}
                onChange={() => toggleEmployee(employee.id)}
                title={employee.displayName}
                description={`${employee.environment} · ${employee.boundInstanceIds.length} bound Instances`}
                icon={<Bot className="size-5" />}
                disabled={employee.status !== "active"}
              />
            ))}
            {!employees.data?.length ? (
              <p className="border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2">
                No Virtual Employees are available. You may save the policy unbound and assign it later.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!loading && step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Check className="size-5" /> Review enforcement</CardTitle>
            <CardDescription>
              Activation updates existing Instance keys and is also applied whenever a new Instance key is issued.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Summary title="Policy" rows={[
              ["Name", draft.name],
              ["Servers", String(selectedServers.length)],
              ["Virtual Employees", String(draft.virtualEmployeeIds.length)],
            ]} />
            <Summary title="Decision model" rows={[
              ["Combination", "Deny overrides allow"],
              ["Unbound employee", "No MCP access"],
              ["Server ceiling", "MCP allowedTools"],
            ]} />
            <div className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground sm:col-span-2">
              Saving as draft records a version without changing runtime access. Save & activate makes this revision effective immediately.
            </div>
          </CardContent>
        </Card>
      ) : null}
      {mutation.error ? (
        <p role="alert" className="mt-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </EntitySheet>
  );
}

function ServerRules({
  defaultDecision,
  decisions,
  onDecisionChange,
  onDefaultChange,
  server,
}: {
  defaultDecision: "ALLOW" | "DENY";
  decisions: Record<string, AccessPolicyDecision>;
  onDecisionChange: (name: string, decision: AccessPolicyDecision) => void;
  onDefaultChange: (decision: "ALLOW" | "DENY") => void;
  server: McpServerDefinition;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          {server.logoUrl ? <img src={server.logoUrl} alt="" className="size-6 object-contain" /> : <ServerCog className="size-5" />}
          {server.name}
          <Badge variant="outline">{server.tools.length} tools</Badge>
        </CardTitle>
        <CardDescription>Explicit tool decisions override this server default.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">Default for discovered tools</span>
          <Select value={defaultDecision} onValueChange={(value) => onDefaultChange(value as "ALLOW" | "DENY")}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="DENY">Deny</SelectItem>
              <SelectItem value="ALLOW">Allow</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="divide-y">
          {server.tools.map((tool) => (
            <div key={tool.name} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
              <span className="min-w-0">
                <strong className="block truncate text-sm">{tool.title ?? tool.name}</strong>
                <code className="text-[11px] text-muted-foreground">{tool.name}</code>
                {tool.description ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tool.description}</span> : null}
              </span>
              <Select
                value={decisions[toolKey(server.id, tool.name)] ?? "INHERIT"}
                onValueChange={(value) => onDecisionChange(tool.name, value as AccessPolicyDecision)}
              >
                <SelectTrigger aria-label={`Decision for ${tool.name}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INHERIT">Inherit default</SelectItem>
                  <SelectItem value="ALLOW">Allow</SelectItem>
                  <SelectItem value="DENY">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChoiceCard({
  checked,
  description,
  disabled,
  icon,
  onChange,
  title,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  onChange: () => void;
  title: string;
}) {
  return (
    <label className={cn(
      "flex cursor-pointer items-start gap-3 border p-4 transition-colors",
      checked && "border-primary bg-primary/5",
      disabled && "cursor-not-allowed opacity-50",
    )}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="mt-1 size-4 accent-primary" />
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span className="min-w-0">
        <strong className="block truncate text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="space-y-2"><Label>{label}</Label>{children}</label>;
}

function Summary({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <dl className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-xs">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="max-w-[68%] text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
