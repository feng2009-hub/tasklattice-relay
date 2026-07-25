import type { Agent } from "@tasklattice/contracts";
import { Bot, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";

import { PreviewBadge } from "@/components/shared/preview-badge";
import { UiPreviewNotice } from "@/components/shared/ui-preview-notice";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  accessPolicyPreviews,
  effectiveAccessDecisions,
  toolDecisionLabel,
} from "@/lib/access-policy-preview";

export function InstanceEffectiveAccessPreview({ agent }: { agent: Agent }) {
  const previewPolicies = accessPolicyPreviews.slice(0, 2);
  const toolDecisions = effectiveAccessDecisions(previewPolicies).slice(0, 4);

  return (
    <section aria-labelledby="instance-effective-access-heading">
      <UiPreviewNotice>
        This summary combines current Instance configuration with illustrative
        decisions from multiple bound Policies. It does not change the running
        Instance or deliver credentials.
      </UiPreviewNotice>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle
            id="instance-effective-access-heading"
            className="flex flex-wrap items-center gap-2"
          >
            Effective access
            <PreviewBadge />
          </CardTitle>
          <CardDescription>
            Trace what this Instance can use and which control should enforce
            each decision.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <dl className="space-y-5 border-b pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
            <IdentityFact
              icon={Bot}
              label="Virtual member"
              value={compactIdentity(agent.virtualEmployeeId)}
            />
            <IdentityFact
              icon={Fingerprint}
              label="Instance principal"
              value={`tali://instances/${agent.id}`}
              mono
            />
            <IdentityFact
              icon={KeyRound}
              label="Model profile"
              value={agent.model}
            />
            <IdentityFact
              icon={ShieldCheck}
              label="Runtime policy"
              value={agent.policyId}
            />
          </dl>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Capability</th>
                  <th className="px-4 py-3 font-medium">Decision</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Enforced by</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <AccessRow
                  capability={agent.model}
                  decision="Allowed"
                  source="Current Model Profile"
                  enforcedBy="LiteLLM key"
                />
                {toolDecisions.map((decision) => (
                  <AccessRow
                    key={decision.capability}
                    capability={decision.capability}
                    decision={toolDecisionLabel(decision.decision)}
                    source={decision.source}
                    enforcedBy="Tool Gateway"
                  />
                ))}
                <AccessRow
                  capability="Direct target-system network access"
                  decision="Policy-bound"
                  source={agent.policyId}
                  enforcedBy="OpenShell"
                />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function compactIdentity(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function IdentityFact({
  icon: Icon,
  label,
  mono = false,
  value,
}: {
  icon: typeof Bot;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={
            mono
              ? "mt-1 break-all font-mono text-xs"
              : "mt-1 break-words font-medium"
          }
        >
          {value}
        </dd>
      </span>
    </div>
  );
}

function AccessRow({
  capability,
  decision,
  enforcedBy,
  source,
}: {
  capability: string;
  decision: string;
  enforcedBy: string;
  source: string;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-medium">{capability}</td>
      <td className="px-4 py-3">
        <Badge variant="outline">{decision}</Badge>
      </td>
      <td className="px-4 py-3">{source}</td>
      <td className="px-4 py-3">{enforcedBy}</td>
    </tr>
  );
}
