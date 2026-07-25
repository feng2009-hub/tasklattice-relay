import { createFileRoute } from "@tanstack/react-router";

import { AccessPoliciesPreview } from "@/components/access/access-policies-preview";

export const Route = createFileRoute("/$projectId/access-policies/")({
  component: AccessPoliciesRoute,
});

function AccessPoliciesRoute() {
  const { projectId } = Route.useParams();
  return <AccessPoliciesPreview projectId={projectId} />;
}
