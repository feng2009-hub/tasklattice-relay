import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { providerKinds, providerPresets } from "@tasklattice/contracts";
import { providerUiRegistry } from "./provider-ui-registry";

describe("providerUiRegistry", () => {
  it("has one independent configurator and local icon for every built-in Provider", () => {
    expect(Object.keys(providerUiRegistry).sort()).toEqual([...providerKinds].sort());
    expect(providerPresets).toHaveLength(20);
    expect(new Set(Object.values(providerUiRegistry).map((entry) => entry.Component)).size).toBe(20);
    expect(new Set(providerPresets.map((provider) => provider.icon)).size).toBe(20);
    for (const provider of providerPresets) {
      expect(providerUiRegistry[provider.id].Component.name).toMatch(/Provider$/);
      expect(provider.icon).toMatch(/^\/assets\/providers\/.+\.svg$/);
      expect(existsSync(fileURLToPath(new URL(`../../../public${provider.icon}`, import.meta.url)))).toBe(true);
      expect(providerUiRegistry[provider.id].createDraft().provider).toBe(provider.id);
    }
  });
});
