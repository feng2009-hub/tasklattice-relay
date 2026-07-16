import { describe, expect, it } from "vitest";
import type { SandboxPolicyCatalog } from "@tasklattice/contracts";
import { AgentStore } from "../data/agent-store";
import { FilePolicyCatalogSource, normalizeOpenShellPolicy, PolicyService, type PolicyCatalogSource } from "./policy-service";

const source: PolicyCatalogSource = {
  load: (): SandboxPolicyCatalog => ({
    defaultPolicyId: "unrestricted",
    templatePolicyYaml: "version: 1\nfilesystem_policy:\n  read_write:\n    - /sandbox\n    - /tmp\n    - /dev/null\nnetwork_policies: {}\n",
    policies: [{
      id: "unrestricted",
      name: "Unrestricted",
      description: "Allows arbitrary operations in Sandbox-owned writable paths.",
      networkAccess: "Managed inference and declared destinations",
      policyYaml: normalizeOpenShellPolicy("version: 1\nnetwork_policies: {}\n", "version: 1\nfilesystem_policy:\n  read_write:\n    - /dev/null\n"),
      enforcement: "ENFORCE",
      source: "BUILT_IN",
      immutable: true,
    }],
  }),
};

describe("PolicyService", () => {
  it("loads the deployment catalog with unrestricted as the default", () => {
    const catalog = new FilePolicyCatalogSource().load();
    const policy = catalog.policies.find((item) => item.id === catalog.defaultPolicyId);

    expect(catalog.defaultPolicyId).toBe("unrestricted");
    expect(policy).toMatchObject({ source: "BUILT_IN", immutable: true });
    expect(policy?.policyYaml).toContain("/dev/null");
    expect(policy?.policyYaml).toContain("/sandbox");
  });

  it("creates, updates, and deletes custom policies", () => {
    const service = new PolicyService(new AgentStore(), source);
    const created = service.create({
      name: "Internal tools",
      description: "Allows the internal tools required by this environment.",
      networkAccess: "tools.example.com",
      policyYaml: "version: 1\nnetwork_policies: {}\n",
    });

    expect(created).toMatchObject({ source: "CUSTOM", immutable: false });
    expect(created.policyYaml).toContain("/dev/null");
    expect(service.update(created.id, { ...created, name: "Internal tooling" }).name).toBe("Internal tooling");
    expect(service.delete(created.id)).toBe(true);
    expect(service.get(created.id)).toBeUndefined();
  });

  it("protects built-in policies and rejects unsafe process identity", () => {
    const service = new PolicyService(new AgentStore(), source);
    const input = {
      name: "Unrestricted",
      description: "Allows arbitrary operations in Sandbox-owned writable paths.",
      networkAccess: "Managed inference and declared destinations",
      policyYaml: "version: 1\nnetwork_policies: {}\n",
    };

    expect(() => service.update("unrestricted", input)).toThrow("ConfigMap");
    expect(() => service.delete("unrestricted")).toThrow("ConfigMap");
    expect(() => normalizeOpenShellPolicy("version: 1\nprocess:\n  run_as_user: root\n")).toThrow("root");
    expect(() => normalizeOpenShellPolicy("version: 2\n")).toThrow("version: 1");
  });

  it("does not delete a custom Policy assigned to an Instance", () => {
    const store = new AgentStore();
    const service = new PolicyService(store, source);
    const policy = service.create({
      name: "Assigned policy",
      description: "A custom Policy currently assigned to an Instance.",
      networkAccess: "Managed inference only",
      policyYaml: "version: 1\nnetwork_policies: {}\n",
    });
    const now = new Date().toISOString();
    store.save({
      id: "agent-a",
      name: "Policy user",
      description: "",
      runtime: "openshell",
      agentPlatform: "openclaw",
      modelDeploymentId: "model-a",
      policyId: policy.id,
      systemPrompt: "Use the assigned policy for this test.",
      providerAccountId: "provider-a",
      providerName: "Provider",
      model: "model-a",
      modelType: "llm",
      costKeyAlias: "agent-a:model-a",
      sandboxName: "tali-policy-agent-a",
      status: "READY",
      createdAt: now,
      updatedAt: now,
      logs: [],
    });

    expect(() => service.delete(policy.id)).toThrow("assigned to an Instance");
  });
});
