import { defineMiddleware } from "nitro";
import { requireAuth, unauthorizedResponse } from "../auth/auth";
import { prisma } from "../db/prisma";
import { errorResponse } from "../http/responses";
import { requireProjectCapability } from "../services";
import { markProjectAdmissionComplete } from "../authorization/authorization-context";
import {
  conditionalRequestRequirements,
  concreteRelation,
  projectRouteAdmissionPolicy,
  type RelationResolver,
} from "../authorization/route-capabilities";
import {
  accessForMembership,
  membershipAccessInclude,
  type ProjectRole,
} from "../projects/project-access";

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.clone().json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function projectId(pathname: string): string {
  return decodeURIComponent(pathname.split("/")[4] ?? "");
}

async function ownership(
  request: Request,
  actorId: string,
  resolver: RelationResolver,
  resourceId?: string,
): Promise<{
  collectionRole?: ProjectRole;
  ownedByActor: boolean;
}> {
  const path = new URL(request.url).pathname;
  const scopedProjectId = projectId(path);
  if (resolver === "INSTANCE_COLLECTION") {
    const membership = await prisma().projectMember.findUnique({
      where: {
        projectId_userId: { projectId: scopedProjectId, userId: actorId },
      },
      include: membershipAccessInclude,
    });
    const collectionRole = membership
      ? accessForMembership(membership).activeRole
      : undefined;
    return {
      ...(collectionRole ? { collectionRole } : {}),
      ownedByActor: false,
    };
  }
  if (resolver === "INSTANCE") {
    const row = resourceId
      ? await prisma().agentRecord.findUnique({
          where: { projectId_id: { projectId: scopedProjectId, id: resourceId } },
          select: { ownerUserId: true },
        })
      : undefined;
    return { ownedByActor: row?.ownerUserId === actorId };
  }
  if (resolver === "REGISTERED_AGENT") {
    const row = resourceId
      ? await prisma().agentCatalogRecord.findUnique({
          where: { projectId_id: { projectId: scopedProjectId, id: resourceId } },
          select: { ownerUserId: true },
        })
      : undefined;
    return { ownedByActor: row?.ownerUserId === actorId };
  }
  if (resolver === "AGENT_CONNECTION") {
    let coordinatorInstanceId: string | undefined;
    if (request.method.toUpperCase() === "POST") {
      const body = await jsonBody(request);
      coordinatorInstanceId = typeof body.coordinatorInstanceId === "string"
        ? body.coordinatorInstanceId
        : undefined;
    } else if (resourceId) {
      const connection = await prisma().agentConnectionRecord.findUnique({
        where: { projectId_id: { projectId: scopedProjectId, id: resourceId } },
        select: { coordinatorInstanceId: true },
      });
      coordinatorInstanceId = connection?.coordinatorInstanceId;
    }
    const instance = coordinatorInstanceId
      ? await prisma().agentRecord.findUnique({
          where: {
            projectId_id: {
              projectId: scopedProjectId,
              id: coordinatorInstanceId,
            },
          },
          select: { ownerUserId: true },
        })
      : undefined;
    return { ownedByActor: instance?.ownerUserId === actorId };
  }
  return { ownedByActor: resolver === "NEW_OWNER" };
}

export default defineMiddleware(async (event) => {
  const url = new URL(event.req.url);
  const admission = projectRouteAdmissionPolicy(event.req.method, url.pathname);
  const isProjectScoped = /^\/api\/v1\/projects\/[^/]+(?:\/|$)/.test(url.pathname);
  if (!isProjectScoped || event.req.method.toUpperCase() === "OPTIONS") return;
  if (!admission) {
    return errorResponse(new Error(
      "Access denied: this Project route has no Capability admission policy.",
    ));
  }
  if (admission.skipBecauseCapabilityToken) return;

  let actorId: string;
  try {
    actorId = (await requireAuth(event.req)).user.id;
  } catch (error) {
    return unauthorizedResponse(error);
  }

  try {
    const ownershipResult = await ownership(
      event.req,
      actorId,
      admission.relation,
      admission.resourceId,
    );
    const relation = concreteRelation(
      admission.relation,
      ownershipResult.ownedByActor,
      ownershipResult.collectionRole,
    );
    const requirements = [...admission.requirements];
    requirements.push(...conditionalRequestRequirements(
      admission,
      url,
      admission.kind === "INSTANCE_CREATE" ? await jsonBody(event.req) : {},
    ));
    for (const requirement of requirements) {
      await requireProjectCapability(event.req, requirement.capability, {
        relation,
        ...(admission.resourceId ? { resourceId: admission.resourceId } : {}),
        resourceType: requirement.resourceType,
      });
    }
    markProjectAdmissionComplete(event.req);
  } catch (error) {
    return errorResponse(error);
  }
});
