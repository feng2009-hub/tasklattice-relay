import { createFileRoute } from "@tanstack/react-router";

import { AccessPolicyDetailPreview } from "@/components/access/access-policy-detail-preview";

export const Route = createFileRoute(
  "/$projectId/access-policies/$policyId",
)({
  component: AccessPolicyDetailRoute,
});

function AccessPolicyDetailRoute() {
  const { policyId, projectId } = Route.useParams();
  return (
    <AccessPolicyDetailPreview
      policyId={policyId}
      projectId={projectId}
    />
  );
}
