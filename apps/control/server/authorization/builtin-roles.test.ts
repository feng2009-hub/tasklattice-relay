import {
  projectCapabilities,
  projectCapabilityDefinition,
  type ProjectCapability,
} from "@tali/contracts";
import { describe, expect, it } from "vitest";
import {
  builtinProjectRoles,
  builtinRole,
  builtinRoleForMembership,
} from "./builtin-roles";

const forbiddenForEveryHumanRole = [
  "CAP_PROJECT_CREATE",
  "CAP_APPROVED_CHANGE_APPLY",
  "CAP_APPROVAL_OVERRIDE",
] as const satisfies readonly ProjectCapability[];

describe("builtin Project roles", () => {
  it("binds immutable, unique, registered capabilities to every builtin role", () => {
    expect(new Set(builtinProjectRoles.map(({ id }) => id)).size).toBe(5);
    const registry = new Set(projectCapabilities);
    for (const role of builtinProjectRoles) {
      expect(role.immutable).toBe(true);
      expect(Object.isFrozen(role)).toBe(true);
      expect(Object.isFrozen(role.grants)).toBe(true);
      expect(Object.isFrozen(role.capabilities)).toBe(true);
      expect(role.grants.map(({ capability }) => capability)).toEqual(role.capabilities);
      expect(role.grants.every(({ relations }) => Object.isFrozen(relations))).toBe(true);
      expect(new Set(role.capabilities).size).toBe(role.capabilities.length);
      expect(role.capabilities.every((capability) => registry.has(capability))).toBe(true);
      for (const forbidden of forbiddenForEveryHumanRole) {
        expect(role.capabilities).not.toContain(forbidden);
      }
    }
    expect(projectCapabilities.every((id) => /^CAP_[A-Z0-9_]+$/.test(id))).toBe(true);
    expect(projectCapabilities).not.toContain("CAP_SECRET_READ" as ProjectCapability);
    expect(projectCapabilities).not.toContain("CAP_SECRET_REVEAL" as ProjectCapability);
  });

  it("gives Project Administrator the complete Project-scoped capability set", () => {
    const capabilities = builtinRole("ROLE_PROJECT_ADMIN").capabilities;
    expect(capabilities).toEqual(
      projectCapabilities.filter(
        (capability) => !forbiddenForEveryHumanRole.includes(
          capability as (typeof forbiddenForEveryHumanRole)[number],
        ),
      ),
    );
    expect(capabilities).toEqual(expect.arrayContaining([
      "CAP_PROJECT_SETTINGS_UPDATE",
      "CAP_PROJECT_MEMBER_INVITE",
      "CAP_PROJECT_MEMBER_ROLE_ASSIGN",
      "CAP_PROVIDER_CREATE",
      "CAP_PROVIDER_DISCOVER",
      "CAP_MODEL_CREATE",
      "CAP_MODEL_DELETE",
      "CAP_MODEL_ROUTING_CREATE",
      "CAP_MODEL_ROUTING_UPDATE",
      "CAP_MODEL_ROUTING_DELETE",
      "CAP_MODEL_ROUTING_RECONCILE",
      "CAP_AGENT_INSTANCE_TERMINAL_EXEC",
      "CAP_AGENT_INSTANCE_DELETE",
      "CAP_AGENT_MEMORY_CONTENT_VIEW",
      "CAP_AUDIT_EXPORT",
      "CAP_APPROVAL_REQUEST_DECIDE",
    ]));
    expect(capabilities).not.toContain("CAP_PROJECT_CREATE");
  });

  it("makes Auditor metadata-oriented and mutation-free", () => {
    const capabilities = builtinRole("ROLE_AUDITOR").capabilities;
    expect(capabilities).toEqual(expect.arrayContaining([
      "CAP_AUDIT_VIEW",
      "CAP_AUDIT_DETAIL_VIEW",
      "CAP_TRACE_VIEW",
      "CAP_AGENT_MEMORY_INDEX_STATUS_VIEW",
    ]));
    expect(capabilities).not.toEqual(expect.arrayContaining([
      "CAP_AUDIT_EXPORT",
      "CAP_TRACE_CONTENT_VIEW",
      "CAP_AGENT_MEMORY_CONTENT_VIEW",
      "CAP_AGENT_INSTANCE_INTERACT",
    ]));
    const mutationActions = /_(?:CREATE|UPDATE|DELETE|ASSIGN|GRANT|REVOKE|EXEC|DECIDE|APPLY|WRITE|PURGE|IMPORT|EXPORT)$/;
    expect(capabilities.filter((capability) => mutationActions.test(capability))).toEqual([]);
  });

  it("limits Agent Developer to owned/maintained lifecycle operations", () => {
    const role = builtinRole("ROLE_AGENT_DEVELOPER");
    expect(role.relations).toEqual([
      "PROJECT_ANY",
      "OWNER",
      "MAINTAINER",
      "SESSION_PARTICIPANT",
    ]);
    expect(role.capabilities).toEqual(expect.arrayContaining([
      "CAP_AGENT_INSTANCE_CREATE",
      "CAP_AGENT_INSTANCE_UPDATE",
      "CAP_AGENT_INSTANCE_DELETE",
      "CAP_AGENT_MEMORY_CONFIG_UPDATE",
      "CAP_AGENT_MEMORY_RECALL_USE",
      "CAP_APPROVAL_REQUEST_SUBMIT",
    ]));
    expect(role.capabilities).not.toEqual(expect.arrayContaining([
      "CAP_PROJECT_MEMBER_INVITE",
      "CAP_PROJECT_ROLE_UPDATE",
      "CAP_PROJECT_QUOTA_UPDATE",
      "CAP_AGENT_INSTANCE_TERMINAL_EXEC",
      "CAP_AGENT_MEMORY_CONTENT_VIEW",
      "CAP_APPROVAL_REQUEST_DECIDE",
    ]));
  });

  it("scopes each Developer grant independently", () => {
    const grants = new Map(
      builtinRole("ROLE_AGENT_DEVELOPER").grants.map((item) => [
        item.capability,
        item.relations,
      ]),
    );
    expect(grants.get("CAP_PROJECT_QUOTA_VIEW")).toEqual(["PROJECT_ANY"]);
    expect(grants.get("CAP_SKILL_VIEW")).toEqual(["PROJECT_ANY"]);
    expect(grants.get("CAP_AGENT_INSTANCE_DELETE")).toEqual([
      "OWNER",
      "MAINTAINER",
    ]);
    expect(grants.get("CAP_AGENT_SESSION_MESSAGE_SEND")).toEqual([
      "SESSION_PARTICIPANT",
    ]);
  });

  it("separates User memory recall from raw memory access", () => {
    const capabilities = builtinRole("ROLE_USER").capabilities;
    expect(capabilities).toEqual(expect.arrayContaining([
      "CAP_AGENT_INSTANCE_INTERACT",
      "CAP_AGENT_SESSION_CREATE",
      "CAP_AGENT_SESSION_MESSAGE_SEND",
      "CAP_AGENT_MEMORY_RECALL_USE",
    ]));
    expect(capabilities).not.toEqual(expect.arrayContaining([
      "CAP_AGENT_INSTANCE_CONFIG_VIEW",
      "CAP_AGENT_INSTANCE_TERMINAL_EXEC",
      "CAP_AGENT_MEMORY_CONTENT_VIEW",
      "CAP_AGENT_MEMORY_SEARCH",
      "CAP_AUDIT_VIEW",
    ]));
  });

  it("keeps Approver independent from target mutations", () => {
    const capabilities = builtinRole("ROLE_APPROVER").capabilities;
    expect(capabilities).toEqual(expect.arrayContaining([
      "CAP_APPROVAL_REQUEST_VIEW",
      "CAP_APPROVAL_REQUEST_COMMENT",
      "CAP_APPROVAL_REQUEST_DECIDE",
    ]));
    expect(capabilities).not.toContain("CAP_AGENT_INSTANCE_DELETE");
    expect(capabilities).not.toContain("CAP_PROJECT_ROLE_UPDATE");
  });

  it("maps the User membership directly to the User builtin role", () => {
    expect(builtinRoleForMembership("user")).toBe(
      builtinRole("ROLE_USER"),
    );
  });

  it("registers the complete Memory capability boundary", () => {
    const memoryCapabilities = projectCapabilities.filter((capability) =>
      capability.startsWith("CAP_AGENT_MEMORY_"),
    );
    expect(memoryCapabilities).toHaveLength(20);
    expect(memoryCapabilities).toEqual(expect.arrayContaining([
      "CAP_AGENT_MEMORY_CONFIG_VIEW",
      "CAP_AGENT_MEMORY_CONTENT_PURGE",
      "CAP_AGENT_MEMORY_RECALL_USE",
      "CAP_AGENT_MEMORY_SESSION_INDEX_MANAGE",
      "CAP_AGENT_MEMORY_LEGAL_HOLD_MANAGE",
    ]));
    expect(projectCapabilityDefinition("CAP_AGENT_MEMORY_CONTENT_VIEW").sensitiveContent).toBe(true);
  });
});
