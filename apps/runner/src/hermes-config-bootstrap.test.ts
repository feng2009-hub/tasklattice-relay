import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const temporaryDirectories: string[] = [];
const bootstrap = resolve(
  import.meta.dirname,
  "../../../scripts/bootstrap-hermes-config.py",
);
const mcpHash = "a".repeat(64);
const managedCredentialSentinel = "sk-OPENSHELL-PROXY-REWRITE";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Hermes config bootstrap", () => {
  it("routes through the custom provider with NemoClaw's managed credential sentinel", async () => {
    const root = await mkdtemp(join(tmpdir(), "tali-hermes-config-"));
    temporaryDirectories.push(root);
    const state = join(root, ".hermes");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(state));
    const config = join(state, "config.yaml");
    const environment = join(state, ".env");
    const anchor = join(state, ".config-hash");
    const builder = join(root, "mcp-digest.py");
    const guard = join(root, "guard.py");
    const initial = `# Managed by NemoClaw
_nemoclaw_upstream:
  provider: deepseek
  provider_key: deepseek
  model: deepseek-chat
model:
  default: deepseek-chat
  provider: custom
  base_url: "https://inference.local/v1"
  api_key: sk-OPENSHELL-PROXY-REWRITE
providers:
  deepseek:
    name: deepseek
    api: "https://inference.local/v1"
    api_key: sk-OPENSHELL-PROXY-REWRITE
custom_providers:
  -
    name: deepseek
    base_url: "https://inference.local/v1"
    api_key: sk-OPENSHELL-PROXY-REWRITE
`;
    const env = "HERMES_HOME=/sandbox/.hermes\n";
    await writeFile(config, initial);
    await writeFile(environment, env);
    await writeFile(builder, `print("${mcpHash}")\n`);
    await writeFile(guard, "# test guard\n");
    await writeFile(
      anchor,
      `${digest(initial)}  ${config}\n${digest(env)}  ${environment}\n# nemoclaw-hermes-mcp-state-v1 intended=${mcpHash} applied=${mcpHash}\n`,
    );

    const args = [
      bootstrap,
      "--config",
      config,
      "--hash-file",
      anchor,
      "--endpoint",
      "http://tali-litellm:4000/v1",
      "--model",
      "tali/provider/deepseek-v4-pro",
      "--template-endpoint",
      "https://inference.local/v1",
      "--template-model",
      "deepseek-chat",
      "--mcp-digest-builder",
      builder,
      "--runtime-config-guard",
      guard,
    ];
    const first = spawnSync("python3", args, { encoding: "utf8" });
    expect(first.status, first.stderr).toBe(0);
    const migrated = await readFile(config, "utf8");
    const document = parse(migrated) as Record<string, any>;
    expect(document.model.provider).toBe("custom");
    expect(document.model.api_key).toBe(managedCredentialSentinel);
    expect(document.providers.deepseek.api_key).toBe(managedCredentialSentinel);
    expect(document.custom_providers[0].api_key).toBe(managedCredentialSentinel);

    const second = spawnSync("python3", args, { encoding: "utf8" });
    expect(second.status, second.stderr).toBe(0);
    const rerun = await readFile(config, "utf8");
    expect(rerun.match(/sk-OPENSHELL-PROXY-REWRITE/g)).toHaveLength(3);
    expect(await readFile(anchor, "utf8")).toContain(
      `${digest(rerun)}  ${config}`,
    );
  });
});
