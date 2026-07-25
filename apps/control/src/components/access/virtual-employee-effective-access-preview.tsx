import type { VirtualEmployee } from "@tasklattice/contracts";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { PreviewBadge } from "@/components/shared/preview-badge";
import { UiPreviewNotice } from "@/components/shared/ui-preview-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accessPolicyPreviews,
  effectiveAccessDecisions,
  oauthConnectionPreviews,
  toolDecisionLabel,
} from "@/lib/access-policy-preview";
import { cn } from "@/lib/utils";

interface CredentialGrantPreview {
  connectionId: string;
  id: string;
  serverId: string;
}

const serverOptions = Array.from(
  new Map(
    accessPolicyPreviews.flatMap((policy) =>
      policy.servers.map((server) => [server.id, server.name] as const),
    ),
  ),
).map(([id, name]) => ({ id, name }));

export function VirtualEmployeeEffectiveAccessPreview({
  employee,
  projectId,
}: {
  employee: VirtualEmployee;
  projectId: string;
}) {
  const [boundPolicyIds, setBoundPolicyIds] = useState(() =>
    suggestedPolicyIds(employee.businessRole),
  );
  const [credentialGrants, setCredentialGrants] = useState<
    CredentialGrantPreview[]
  >([
    {
      id: "grant-jupyter",
      connectionId: "jupyter-project",
      serverId: "jupyter-mcp",
    },
  ]);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(
    oauthConnectionPreviews[0]!.id,
  );
  const [serverId, setServerId] = useState(serverOptions[0]!.id);
  const [feedback, setFeedback] = useState("");

  const boundPolicies = useMemo(
    () =>
      accessPolicyPreviews.filter((policy) =>
        boundPolicyIds.includes(policy.id),
      ),
    [boundPolicyIds],
  );
  const decisions = useMemo(
    () => effectiveAccessDecisions(boundPolicies),
    [boundPolicies],
  );
  const firstInstanceId = employee.boundInstanceIds[0];

  function togglePolicy(policyId: string) {
    setBoundPolicyIds((current) =>
      current.includes(policyId)
        ? current.filter((id) => id !== policyId)
        : [...current, policyId],
    );
    setFeedback("Policy bindings updated in preview state only.");
  }

  function addCredentialGrant() {
    const duplicate = credentialGrants.some(
      (grant) =>
        grant.connectionId === connectionId && grant.serverId === serverId,
    );
    if (!duplicate) {
      setCredentialGrants((current) => [
        ...current,
        {
          id: `grant-${connectionId}-${serverId}`,
          connectionId,
          serverId,
        },
      ]);
    }
    setFeedback(
      duplicate
        ? "That Credential Grant already exists in the preview."
        : "Credential Grant added in preview state only.",
    );
    setGrantDialogOpen(false);
  }

  return (
    <div className="space-y-5">
      <UiPreviewNotice>
        Policy Bindings and Credential Grants below are separate browser-only
        controls. OAuth tokens are never displayed or delivered to the Agent.
      </UiPreviewNotice>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Authorization chain
            <PreviewBadge />
          </CardTitle>
          <CardDescription>
            Tool execution requires an allowed Policy decision and, when
            needed, a matching Credential Grant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid overflow-hidden rounded-md border md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
            <IdentityStep
              icon={Bot}
              eyebrow="Project member"
              title={employee.displayName}
              detail={employee.businessRole || "Virtual member"}
            />
            <ChainArrow />
            <IdentityStep
              icon={ShieldCheck}
              eyebrow="Policy Bindings"
              title={`${boundPolicies.length} bound`}
              detail="Action authorization"
            />
            <ChainArrow />
            <IdentityStep
              icon={KeyRound}
              eyebrow="Credential Grants"
              title={`${credentialGrants.length} available`}
              detail="Brokered OAuth use"
            />
            <ChainArrow />
            <IdentityStep
              icon={Fingerprint}
              eyebrow="Runtime principal"
              title={`${employee.boundInstanceIds.length} Instance${employee.boundInstanceIds.length === 1 ? "" : "s"}`}
              detail="Short-lived identity"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card>
          <CardHeader>
            <CardTitle>Effective MCP tool access</CardTitle>
            <CardDescription>
              Conflicts resolve as Deny &gt; Require approval &gt; Allow. A
              credential requirement is evaluated separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {decisions.length ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">MCP Tool</th>
                      <th className="px-4 py-3 font-medium">Decision</th>
                      <th className="px-4 py-3 font-medium">Policy source</th>
                      <th className="px-4 py-3 font-medium">Credential</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {decisions.map((decision) => {
                      const credentialReady =
                        !decision.credentialRequirement ||
                        credentialGrants.some(
                          (grant) => grant.serverId === decision.serverId,
                        );
                      return (
                        <tr key={decision.capability}>
                          <td className="px-4 py-3 font-medium">
                            {decision.capability}
                          </td>
                          <td className="px-4 py-3">
                            <DecisionBadge value={decision.decision} />
                          </td>
                          <td className="px-4 py-3">{decision.source}</td>
                          <td className="px-4 py-3">
                            {decision.credentialRequirement ? (
                              <span>
                                <Badge
                                  variant="outline"
                                  className={
                                    credentialReady
                                      ? "border-emerald-500/25 text-emerald-700"
                                      : "border-amber-500/25 text-amber-800"
                                  }
                                >
                                  {credentialReady
                                    ? "Grant ready"
                                    : "Grant missing"}
                                </Badge>
                                <span className="mt-1 block text-[11px] text-muted-foreground">
                                  {decision.credentialRequirement}
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not required
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-dashed px-6 py-12 text-center">
                <ShieldCheck className="mx-auto size-7 text-muted-foreground" />
                <strong className="mt-3 block">No Policies bound</strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bind at least one Policy to calculate effective tool access.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bound Policies</CardTitle>
              <CardDescription>
                Multiple Policies may contribute decisions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {accessPolicyPreviews.map((policy) => {
                const bound = boundPolicyIds.includes(policy.id);
                return (
                  <div
                    key={policy.id}
                    className={cn(
                      "rounded-md border p-3",
                      bound && "border-primary/30 bg-primary/[0.035]",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={bound}
                      onClick={() => togglePolicy(policy.id)}
                      className="flex min-h-8 w-full items-center gap-3 text-left focus-visible:outline-2"
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-sm border",
                          bound &&
                            "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {bound ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {policy.name}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          v{policy.revision} · {policy.status.toLowerCase()}
                        </span>
                      </span>
                    </button>
                    <Link
                      to="/$projectId/access-policies/$policyId"
                      params={{ projectId, policyId: policy.id }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View Policy
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Credential Grants</CardTitle>
              <CardDescription>
                Permission to use a Connection without exposing its token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {credentialGrants.map((grant) => {
                const connection = oauthConnectionPreviews.find(
                  (candidate) => candidate.id === grant.connectionId,
                );
                const server = serverOptions.find(
                  (candidate) => candidate.id === grant.serverId,
                );
                if (!connection) return null;
                return (
                  <div key={grant.id} className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">
                        {connection.provider} · {connection.ownerLabel}
                      </strong>
                      <Badge variant="outline" className="text-[10px]">
                        {connection.ownerType === "USER_DELEGATED"
                          ? "User delegated"
                          : "Project service"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {server?.name ?? grant.serverId}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {connection.grantedScopes.join(", ")}
                    </p>
                  </div>
                );
              })}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setGrantDialogOpen(true)}
              >
                <Plus />
                Grant OAuth Connection
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button asChild variant="outline" className="w-full">
              <Link to="/$projectId/access-policies" params={{ projectId }}>
                Open Access Policies
                <ExternalLink />
              </Link>
            </Button>
            {firstInstanceId ? (
              <Button asChild variant="ghost" className="w-full">
                <Link
                  to="/$projectId/instances/$instanceId"
                  params={{ projectId, instanceId: firstInstanceId }}
                  search={{ tab: "capabilities" }}
                >
                  Inspect bound Instance
                  <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {feedback ? (
        <p
          role="status"
          className="flex items-center gap-2 border-l-2 border-primary bg-muted/30 px-4 py-3 text-xs"
        >
          <Check className="size-4 text-primary" />
          {feedback}
        </p>
      ) : null}

      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant OAuth Connection</DialogTitle>
            <DialogDescription>
              Authorize this Virtual Employee to use one managed Connection for
              a specific MCP Server. No token is shown or copied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <label className="block space-y-2">
              <span className="text-xs font-medium">OAuth Connection</span>
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {oauthConnectionPreviews.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.provider} · {connection.ownerLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium">MCP Server</span>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serverOptions.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
              At runtime, a Credential Broker would mint or retrieve a
              short-lived token for the outbound MCP call. The Agent would not
              receive the refresh token.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGrantDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={addCredentialGrant}>Grant in preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function suggestedPolicyIds(businessRole?: string) {
  const normalized = businessRole?.toLowerCase() ?? "";
  if (normalized.includes("sre") || normalized.includes("incident")) {
    return ["incident-response"];
  }
  if (normalized.includes("research")) return ["research-readonly"];
  return ["data-operations"];
}

function IdentityStep({
  detail,
  eyebrow,
  icon: Icon,
  title,
}: {
  detail: string;
  eyebrow: string;
  icon: typeof Bot;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{eyebrow}</span>
        <strong className="block truncate font-medium">{title}</strong>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
    </div>
  );
}

function ChainArrow() {
  return (
    <span className="hidden items-center border-x bg-muted/25 px-2 text-muted-foreground md:flex">
      <ArrowRight className="size-3.5" />
    </span>
  );
}

function DecisionBadge({
  value,
}: {
  value: "allow" | "require_approval" | "deny";
}) {
  return (
    <Badge
      variant="outline"
      className={
        value === "deny"
          ? "border-destructive/25 text-destructive"
          : value === "require_approval"
            ? "border-amber-500/25 text-amber-800"
            : "border-emerald-500/25 text-emerald-700"
      }
    >
      {toolDecisionLabel(value)}
    </Badge>
  );
}
