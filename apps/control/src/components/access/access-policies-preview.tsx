import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Clock3,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";

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
  accessPolicyPreviews,
  policyReviewCount,
  policyRuleCount,
} from "@/lib/access-policy-preview";

export function AccessPoliciesPreview({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Policies"
        badge={<PreviewBadge />}
        description="Create and review reusable policies that decide which discovered MCP tools a virtual Project member may invoke."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/$projectId/mcp-servers" params={{ projectId }}>
                <ServerCog />
                MCP Servers
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/$projectId/setting"
                params={{ projectId }}
                search={{ section: "members" }}
              >
                <Users />
                Project members
              </Link>
            </Button>
          </div>
        }
      />

      <UiPreviewNotice>
        These Policy items and their discovered Tool counts are preview data.
        Opening a Policy changes only local React state; no rule is persisted
        or enforced.
      </UiPreviewNotice>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Policies</CardTitle>
          <CardDescription>
            Each Policy is independently versioned and can be bound to one or
            more virtual members.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_6rem_9rem] gap-4 border-b bg-muted/25 px-5 py-3 text-xs font-medium text-muted-foreground md:grid">
            <span>Policy</span>
            <span>Status</span>
            <span>Rules</span>
            <span>Bindings</span>
            <span>Version</span>
            <span>Updated</span>
          </div>
          <div className="divide-y">
            {accessPolicyPreviews.map((policy) => {
              const reviewCount = policyReviewCount(policy);
              return (
                <Link
                  key={policy.id}
                  to="/$projectId/access-policies/$policyId"
                  params={{ projectId, policyId: policy.id }}
                  className="group relative grid min-h-24 gap-3 px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring md:grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_6rem_9rem] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="size-4 shrink-0 text-primary" />
                      <strong className="truncate">{policy.name}</strong>
                      {reviewCount ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/25 text-amber-800"
                        >
                          {reviewCount} to review
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block max-w-xl text-xs leading-5 text-muted-foreground">
                      {policy.description}
                    </span>
                  </span>
                  <PolicyStatus status={policy.status} />
                  <DataCell
                    icon={ServerCog}
                    label="Rules"
                    value={String(policyRuleCount(policy))}
                  />
                  <DataCell
                    icon={Bot}
                    label="Bindings"
                    value={String(policy.assignedMembers.length)}
                  />
                  <DataCell
                    label="Version"
                    value={`v${policy.revision}`}
                  />
                  <DataCell
                    icon={Clock3}
                    label="Updated"
                    value={policy.updatedAt}
                  />
                  <ArrowRight className="absolute right-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 md:hidden" />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs leading-5 text-muted-foreground">
        Access Policies govern tool invocation only. Model Profiles, OAuth
        credentials, and OpenShell Runtime Policies remain separate controls.
      </p>
    </div>
  );
}

function PolicyStatus({
  status,
}: {
  status: "ACTIVE" | "DRAFT";
}) {
  return (
    <span>
      <span className="mb-1 block text-[11px] text-muted-foreground md:hidden">
        Status
      </span>
      <Badge
        variant={status === "ACTIVE" ? "secondary" : "outline"}
        className="text-[10px]"
      >
        {status}
      </Badge>
    </span>
  );
}

function DataCell({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Bot;
  label: string;
  value: string;
}) {
  return (
    <span className="text-sm">
      <span className="mb-1 block text-[11px] text-muted-foreground md:hidden">
        {label}
      </span>
      <span className="flex items-center gap-1.5 font-medium">
        {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
        {value}
      </span>
    </span>
  );
}
