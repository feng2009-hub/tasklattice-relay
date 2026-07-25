import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Check,
  Clock3,
  KeyRound,
  Plus,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  accessPolicyPreviews,
  policyReviewCount,
  policyRuleCount,
  toolDecisionLabel,
  toolDecisions,
  withAssignedMember,
  withServerDefaultDecision,
  withToolDecision,
  type ExplicitToolDecision,
  type ToolDecision,
} from "@/lib/access-policy-preview";

const previewMembers = [
  "Jupyter Worker",
  "Research Assistant",
  "Incident Investigator",
];

export function AccessPolicyDetailPreview({
  policyId,
  projectId,
}: {
  policyId: string;
  projectId: string;
}) {
  const [policies, setPolicies] = useState(accessPolicyPreviews);
  const [memberToAssign, setMemberToAssign] = useState(previewMembers[2]!);
  const [feedback, setFeedback] = useState("");
  const policy = policies.find((candidate) => candidate.id === policyId);

  if (!policy) {
    return (
      <div className="space-y-5">
        <BackToPolicies projectId={projectId} />
        <div className="border border-dashed px-6 py-16 text-center">
          <ShieldCheck className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">Policy not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This preview does not contain a Policy with that identifier.
          </p>
        </div>
      </div>
    );
  }

  function updateTool(toolId: string, decision: ToolDecision) {
    setPolicies((current) =>
      withToolDecision(current, policy!.id, toolId, decision),
    );
    setFeedback("Tool decision updated in preview state only.");
  }

  function updateServerDefault(
    serverId: string,
    decision: ExplicitToolDecision,
  ) {
    setPolicies((current) =>
      withServerDefaultDecision(current, policy!.id, serverId, decision),
    );
    setFeedback("Server default updated in preview state only.");
  }

  function assignMember() {
    setPolicies((current) =>
      withAssignedMember(current, policy!.id, memberToAssign),
    );
    setFeedback(`${memberToAssign} bound in preview state only.`);
  }

  return (
    <div className="space-y-6">
      <BackToPolicies projectId={projectId} />
      <PageHeader
        title={policy.name}
        badge={
          <div className="flex items-center gap-2">
            <Badge variant={policy.status === "ACTIVE" ? "secondary" : "outline"}>
              {policy.status}
            </Badge>
            <Badge variant="outline">v{policy.revision}</Badge>
            <PreviewBadge />
          </div>
        }
        description={policy.description}
        actions={
          <Button asChild variant="outline">
            <Link to="/$projectId/mcp-servers" params={{ projectId }}>
              <ServerCog />
              Manage MCP Servers
            </Link>
          </Button>
        }
      />

      <UiPreviewNotice>
        This is a Policy entity preview. Tool decisions, server defaults, and
        Virtual Employee bindings stay in browser memory and are not enforced.
      </UiPreviewNotice>

      <Tabs defaultValue="tools">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto"
        >
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tools">
            MCP Tools
            {policyReviewCount(policy) ? (
              <span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800">
                {policyReviewCount(policy)}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="bindings">Bindings</TabsTrigger>
          <TabsTrigger value="versions">Versions & Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Policy boundary</CardTitle>
              <CardDescription>
                This Policy contains action authorization only. It references
                credential requirements but never contains OAuth tokens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                <Definition label="Identifier" value={policy.id} mono />
                <Definition
                  label="Discovered MCP servers"
                  value={String(policy.servers.length)}
                />
                <Definition
                  label="Tool rules"
                  value={String(policyRuleCount(policy))}
                />
                <Definition
                  label="Virtual member bindings"
                  value={String(policy.assignedMembers.length)}
                />
                <Definition label="Created by" value={policy.createdBy} />
                <Definition label="Updated" value={policy.updatedAt} />
                <Definition
                  label="Needs review"
                  value={`${policyReviewCount(policy)} discovered changes`}
                />
                <Definition
                  label="Combination rule"
                  value="Deny > Approval > Allow"
                />
              </dl>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Boundary
              icon={ServerCog}
              title="Access Policy"
              body="MCP tool invocation decisions"
            />
            <Boundary
              icon={KeyRound}
              title="Credential Grant"
              body="Separate permission to use an OAuth Connection"
            />
            <Boundary
              icon={ShieldCheck}
              title="Runtime Policy"
              body="Independent Sandbox and network boundary"
            />
          </div>
        </TabsContent>

        <TabsContent value="tools" className="mt-5 space-y-4">
          <div className="border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Tools marked New or Changed were discovered through MCP
            <code className="mx-1 rounded bg-muted px-1 py-0.5">tools/list</code>
            and should be reviewed before this Policy is published.
          </div>
          {policy.servers.map((server) => (
            <Card key={server.id}>
              <CardHeader className="border-b">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <ServerCog className="size-4 text-primary" />
                  {server.name}
                  <Badge variant="outline">
                    {server.toolRules.length} discovered tools
                  </Badge>
                </CardTitle>
                <CardDescription>
                  New tools inherit the server default until explicitly
                  reviewed.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <strong className="block text-sm">Server default</strong>
                    <span className="text-xs text-muted-foreground">
                      Applied when a Tool rule is set to inherit.
                    </span>
                  </span>
                  <Select
                    value={server.defaultDecision}
                    onValueChange={(value) =>
                      updateServerDefault(
                        server.id,
                        value as ExplicitToolDecision,
                      )
                    }
                  >
                    <SelectTrigger
                      className="w-full sm:w-48"
                      aria-label={`Default decision for ${server.name}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {toolDecisions
                        .filter(
                          (decision): decision is ExplicitToolDecision =>
                            decision !== "inherit",
                        )
                        .map((decision) => (
                          <SelectItem key={decision} value={decision}>
                            {toolDecisionLabel(decision)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="divide-y">
                  {server.toolRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="font-mono text-xs">
                            {rule.toolName}
                          </strong>
                          <DiscoveryBadge status={rule.discoveryStatus} />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {rule.description}
                        </p>
                      </div>
                      <span className="text-xs">
                        <span className="block text-muted-foreground">
                          Credential requirement
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 font-medium">
                          {rule.credentialRequirement ? (
                            <>
                              <KeyRound className="size-3.5" />
                              {rule.credentialRequirement}
                            </>
                          ) : (
                            "None"
                          )}
                        </span>
                      </span>
                      <Select
                        value={rule.decision}
                        onValueChange={(value) =>
                          updateTool(rule.id, value as ToolDecision)
                        }
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={`Decision for ${rule.toolName}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {toolDecisions.map((decision) => (
                            <SelectItem key={decision} value={decision}>
                              {toolDecisionLabel(decision)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="bindings" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Virtual Employee bindings</CardTitle>
              <CardDescription>
                A virtual member can receive multiple Policies. Conflicts are
                resolved using the most restrictive matching decision.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={memberToAssign}
                  onValueChange={setMemberToAssign}
                >
                  <SelectTrigger className="w-full sm:max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {previewMembers.map((member) => (
                      <SelectItem key={member} value={member}>
                        {member}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={assignMember}>
                  <Plus />
                  Bind in preview
                </Button>
              </div>
              <div className="divide-y rounded-md border">
                {policy.assignedMembers.length ? (
                  policy.assignedMembers.map((member) => (
                    <div
                      key={member}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                          <Bot className="size-4" />
                        </span>
                        <span>
                          <strong className="block text-sm">{member}</strong>
                          <span className="text-xs text-muted-foreground">
                            Virtual Project member
                          </span>
                        </span>
                      </span>
                      <Badge variant="outline">Bound</Badge>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    This draft is not bound to a virtual member.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Revision history</CardTitle>
              <CardDescription>
                Published revisions remain immutable and auditable.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {policy.versions.map((version) => (
                <div
                  key={version.revision}
                  className="grid gap-3 py-4 sm:grid-cols-[5rem_minmax(0,1fr)_12rem]"
                >
                  <Badge variant="outline" className="w-fit">
                    v{version.revision}
                  </Badge>
                  <span>
                    <strong className="block text-sm">{version.summary}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {version.actor}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
                    <Clock3 className="size-3.5" />
                    {version.createdAt}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {feedback ? (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-md border bg-background px-4 py-3 text-xs shadow-lg"
        >
          <Check className="size-4 text-primary" />
          {feedback}
        </div>
      ) : null}
    </div>
  );
}

function BackToPolicies({ projectId }: { projectId: string }) {
  return (
    <Link
      to="/$projectId/access-policies"
      params={{ projectId }}
      className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2"
    >
      <ArrowLeft className="size-4" />
      Access Policies
    </Link>
  );
}

function DiscoveryBadge({
  status,
}: {
  status: "REVIEWED" | "NEW" | "CHANGED";
}) {
  if (status === "REVIEWED") return null;
  return (
    <Badge
      variant="outline"
      className="border-amber-500/25 bg-amber-500/5 text-[10px] text-amber-800"
    >
      {status === "NEW" ? "New" : "Schema changed"}
    </Badge>
  );
}

function Definition({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "mt-1 break-all font-mono text-xs"
            : "mt-1 text-sm font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Boundary({
  body,
  icon: Icon,
  title,
}: {
  body: string;
  icon: typeof ShieldCheck;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {body}
        </span>
      </span>
    </div>
  );
}
