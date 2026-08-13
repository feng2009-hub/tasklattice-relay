import type {
  AuthorizationDecision,
  BuiltinProjectRoleId,
  ProjectCapability,
  ResourceRelation,
} from "@tali/contracts";

export interface AdmissionEvidence {
  actorId: string;
  capability: ProjectCapability;
  decision: AuthorizationDecision;
  projectId: string;
  reason: string;
  relation: ResourceRelation;
  resourceId?: string;
  resourceType: string;
  roleId?: BuiltinProjectRoleId;
  policyId?: string;
}

interface AuthorizationRequestContext extends Record<string, unknown> {
  platformAdmissionComplete?: boolean;
  platformAdmissionEvidence?: AdmissionEvidence[];
}

type ContextualRequest = Request & { context?: AuthorizationRequestContext };

export function appendAdmissionEvidence(
  request: Request,
  evidence: AdmissionEvidence,
): void {
  const contextualRequest = request as ContextualRequest;
  const context = (contextualRequest.context ??= {});
  (context.platformAdmissionEvidence ??= []).push(evidence);
}

export function admissionEvidenceForRequest(
  request: Request,
): readonly AdmissionEvidence[] {
  return (
    ((request as ContextualRequest).context as AuthorizationRequestContext | undefined)
      ?.platformAdmissionEvidence ?? []
  );
}

export function markProjectAdmissionComplete(request: Request): void {
  const contextualRequest = request as ContextualRequest;
  const context = (contextualRequest.context ??= {});
  context.platformAdmissionComplete = true;
}

export function isProjectAdmissionComplete(request: Request): boolean {
  return (request as ContextualRequest).context?.platformAdmissionComplete === true;
}

export function decisiveAdmissionEvidence(
  evidence: readonly AdmissionEvidence[],
): AdmissionEvidence | undefined {
  return evidence.find((item) => item.decision === "DENY")
    ?? evidence.find((item) => item.decision === "APPROVAL_REQUIRED")
    // Route policies declare their primary capability first. Additional
    // requirements refine admission but must not replace the primary CAP in
    // the searchable, top-level audit fields when every check succeeds.
    ?? evidence[0];
}

export function ownerFilterForCapability(
  request: Request,
  capability: ProjectCapability,
): string | undefined {
  const evidence = admissionEvidenceForRequest(request).findLast(
    (item) => item.capability === capability && item.decision === "ALLOW",
  );
  return evidence?.roleId === "ROLE_AGENT_DEVELOPER"
    && evidence.relation === "OWNER"
    ? evidence.actorId
    : undefined;
}
