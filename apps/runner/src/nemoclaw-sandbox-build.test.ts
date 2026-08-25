import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const buildScript = join(repositoryRoot, "scripts/build-nemoclaw-sandbox.sh");
const openClawWrapper = join(
  repositoryRoot,
  "infra/docker/Dockerfile.nemoclaw-openclaw",
);
const deepAgentsWrapper = join(
  repositoryRoot,
  "infra/docker/Dockerfile.nemoclaw-deepagents",
);

async function executable(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, { encoding: "utf8", mode: 0o755 });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("NemoClaw sandbox image build", () => {
  it("refreshes the selected OpenClaw tag before applying the local wrapper", async () => {
    const root = await mkdtemp(join(tmpdir(), "tali-nemoclaw-build-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const log = join(root, "docker.log");
    await mkdir(bin);

    await executable(
      join(bin, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "clone" ]; then
  target=""
  for argument in "$@"; do target="$argument"; done
  mkdir -p "$target/scripts" "$target/agents/hermes"
  touch "$target/Dockerfile" "$target/agents/hermes/Dockerfile"
  touch "$target/scripts/nemoclaw-start.sh"
fi
`,
    );
    await executable(join(bin, "node"), "#!/usr/bin/env bash\nexit 0\n");
    await executable(
      join(bin, "docker"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
exit 0
`,
    );

    const finalImage = "registry.example/tali-nemoclaw-sandbox:dev";
    const result = spawnSync("bash", [buildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        TMPDIR: root,
        DOCKER_LOG: log,
        NEMOCLAW_AGENT_PLATFORM: "openclaw",
        NEMOCLAW_IMAGE: finalImage,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const commands = (await readFile(log, "utf8")).trim().split("\n");
    const builds = commands.filter((line) => line.startsWith("build "));
    const upstreamImage = "tali-nemoclaw-openclaw-upstream:0.0.114";

    expect(commands[0]).toBe(
      "pull ghcr.io/nvidia/nemoclaw/sandbox-base:v0.0.114",
    );
    expect(builds).toHaveLength(2);
    expect(builds[0]).toMatch(/^build --pull --file .*\/Dockerfile /);
    expect(builds[0]).toContain(
      "--build-arg BASE_IMAGE=ghcr.io/nvidia/nemoclaw/sandbox-base:v0.0.114",
    );
    expect(builds[0]).toContain(`--tag ${upstreamImage}`);
    expect(builds[1]).toBe(
      `build --file ${openClawWrapper} --build-arg BASE_IMAGE=${upstreamImage} --tag ${finalImage} ${repositoryRoot}`,
    );
  });

  it("rejects release image output outside the GitHub Actions release workflow", () => {
    const result = spawnSync("bash", [buildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "false",
        GITHUB_ACTIONS: "false",
        NEMOCLAW_BUILD_OUTPUT: "ci-push",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Release image builds are only supported by the GitHub Actions release workflow.",
    );
  });

  it("rejects non-development final tags in local builds", () => {
    const result = spawnSync("bash", [buildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        NEMOCLAW_BUILD_OUTPUT: "local",
        NEMOCLAW_IMAGE: "registry.example/tali-nemoclaw-sandbox:1.2.3",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Local Sandbox builds must use a :dev final image tag",
    );
  });

  it("streams CI release images through Buildx without loading them into Docker", async () => {
    const root = await mkdtemp(join(tmpdir(), "tali-nemoclaw-push-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const log = join(root, "docker.log");
    await mkdir(bin);

    await executable(
      join(bin, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "clone" ]; then
  target=""
  for argument in "$@"; do target="$argument"; done
  mkdir -p "$target/scripts" "$target/agents/hermes"
  touch "$target/Dockerfile" "$target/agents/hermes/Dockerfile"
  touch "$target/scripts/nemoclaw-start.sh"
fi
`,
    );
    await executable(join(bin, "node"), "#!/usr/bin/env bash\nexit 0\n");
    await executable(
      join(bin, "docker"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
exit 0
`,
    );

    const finalImage = "registry.example/tali-nemoclaw-sandbox:1.2.3-arm64";
    const upstreamImage =
      "registry.example/tali-nemoclaw-sandbox:build-upstream-abc123-arm64";
    const result = spawnSync("bash", [buildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        TMPDIR: root,
        DOCKER_LOG: log,
        CI: "true",
        GITHUB_ACTIONS: "true",
        GITHUB_REF_NAME: "v1.2.3",
        GITHUB_REF_TYPE: "tag",
        GITHUB_WORKFLOW_REF:
          "tasklattice/tasklattice-relay/.github/workflows/release.yml@refs/tags/v1.2.3",
        DOCKER_DEFAULT_PLATFORM: "linux/arm64",
        NEMOCLAW_AGENT_PLATFORM: "openclaw",
        NEMOCLAW_BUILD_OUTPUT: "ci-push",
        NEMOCLAW_IMAGE: finalImage,
        NEMOCLAW_UPSTREAM_IMAGE: upstreamImage,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const commands = (await readFile(log, "utf8")).trim().split("\n");
    const builds = commands.filter((line) => line.startsWith("buildx build "));

    expect(commands[0]).toMatch(/^buildx imagetools inspect /);
    expect(builds).toHaveLength(2);
    expect(builds[0]).toContain("--platform linux/arm64 --push --pull");
    expect(builds[0]).toContain(`--tag ${upstreamImage}`);
    expect(builds[1]).toBe(
      `buildx build --platform linux/arm64 --push --file ${openClawWrapper} --build-arg BASE_IMAGE=${upstreamImage} --tag ${finalImage} ${repositoryRoot}`,
    );
    expect(commands.some((line) => line.startsWith("push "))).toBe(false);
  });

  it("builds the pinned Deep Agents Code source and local wrapper", async () => {
    const root = await mkdtemp(join(tmpdir(), "tali-deepagents-build-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const log = join(root, "docker.log");
    await mkdir(bin);

    await executable(
      join(bin, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "clone" ]; then
  target=""
  for argument in "$@"; do target="$argument"; done
  mkdir -p "$target/agents/langchain-deepagents-code"
  touch "$target/agents/langchain-deepagents-code/Dockerfile"
  touch "$target/agents/langchain-deepagents-code/Dockerfile.base"
fi
`,
    );
    await executable(
      join(bin, "docker"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
exit 0
`,
    );

    const finalImage = "registry.example/tali-nemoclaw-deepagents:dev";
    const result = spawnSync("bash", [buildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        TMPDIR: root,
        DOCKER_LOG: log,
        NEMOCLAW_AGENT_PLATFORM: "deepagents",
        NEMOCLAW_DEEPAGENTS_IMAGE: finalImage,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const commands = (await readFile(log, "utf8")).trim().split("\n");
    const builds = commands.filter((line) => line.startsWith("build "));
    const upstreamImage = "tali-nemoclaw-deepagents-upstream:0.0.114";

    expect(commands[0]).toBe(
      "pull ghcr.io/nvidia/nemoclaw/langchain-deepagents-code-sandbox-base:v0.0.114",
    );
    expect(builds).toHaveLength(2);
    expect(builds[0]).toMatch(
      /^build --pull --file .*\/agents\/langchain-deepagents-code\/Dockerfile /,
    );
    expect(builds[0]).toContain(
      "--build-arg BASE_IMAGE=ghcr.io/nvidia/nemoclaw/langchain-deepagents-code-sandbox-base:v0.0.114",
    );
    expect(builds[0]).toContain(`--tag ${upstreamImage}`);
    expect(builds[1]).toBe(
      `build --file ${deepAgentsWrapper} --build-arg BASE_IMAGE=${upstreamImage} --tag ${finalImage} ${repositoryRoot}`,
    );
  });
});
