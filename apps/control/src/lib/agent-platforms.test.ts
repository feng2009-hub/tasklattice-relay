import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  agentPlatformPresentations,
  getAgentPlatformPresentation,
} from "./agent-platforms";

describe("agent platform presentations", () => {
  it("provides a committed brand image for every Agent platform", async () => {
    for (const platform of agentPlatformPresentations) {
      expect(platform.brandAsset, `${platform.id} is missing a brand image`).toBeTruthy();

      const asset = fileURLToPath(
        new URL(`../../public${platform.brandAsset}`, import.meta.url),
      );
      expect((await stat(asset)).isFile()).toBe(true);
    }
  });

  it("uses the LangGraph artwork for Deep Agents Code", () => {
    expect(getAgentPlatformPresentation("deepagents").brandAsset).toBe(
      "/assets/agent-providers/langgraph.png",
    );
  });
});
