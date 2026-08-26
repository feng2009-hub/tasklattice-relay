#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const target = process.argv[2];
if (!target) {
  console.error(
    "Usage: node scripts/patch-nemoclaw-deepagents-kubernetes-profile.mjs <start.sh>",
  );
  process.exit(2);
}

const upstreamVerifier = `verify_dcode_login_profile() {
  [ -d /sandbox ] \\
    && [ ! -L /sandbox ] \\
    && [ -f "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" ] \\
    && [ ! -L "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" ] \\
    && [ "$(stat -c '%U:%G:%a' "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" 2>/dev/null || true)" = "root:root:444" ] \\
    && [ ! -L /sandbox/.bash_profile ] \\
    && [ "$(stat -c '%U:%G:%a' /sandbox 2>/dev/null || true)" = "root:sandbox:1775" ] \\
    && [ "$(stat -c '%U:%G:%a' /sandbox/.bash_profile 2>/dev/null || true)" = "root:root:444" ] \\
    && cmp -s "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" /sandbox/.bash_profile
}`;

const compatibilityMarker = "verify_tali_kubernetes_dcode_login_profile";
const patchedVerifier = `# OpenShell's Kubernetes driver recursively assigns /sandbox to its injected
# non-root identity before every command. Its upload path therefore replaces
# the image-baked root ownership that upstream verifies below. Native
# Kubernetes is outside NemoClaw's supported deployment matrix, so keep this
# compatibility exception local to Relay and narrower than the upstream path:
# require the OpenShell child marker, the exact Kubernetes workspace modes,
# the effective non-root identity, and byte-for-byte profile contents.
#
# This is not equivalent to the root-owned upstream boundary: the effective
# sandbox identity still owns the compatibility profile. OpenShell continues
# to enforce process, filesystem, and provider policy outside this file. Remove
# this exception when OpenShell can preserve protected image-owned workspace
# entries or provide a root-owned post-reconciliation hook.
${compatibilityMarker}() {
  local current_uid current_gid
  current_uid="$(id -u)"
  current_gid="$(id -g)"

  [ -n "\${OPENSHELL_SANDBOX:-}" ] \\
    && [ "$current_uid" != "0" ] \\
    && [ -d /sandbox ] \\
    && [ ! -L /sandbox ] \\
    && [ -f "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" ] \\
    && [ ! -L "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" ] \\
    && [ "$(stat -c '%u:%g:%a' "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" 2>/dev/null || true)" = "0:0:444" ] \\
    && [ -f /sandbox/.bash_profile ] \\
    && [ ! -L /sandbox/.bash_profile ] \\
    && [ "$(stat -c '%u:%g:%a' /sandbox 2>/dev/null || true)" = "$current_uid:$current_gid:2777" ] \\
    && [ "$(stat -c '%u:%g:%a' /sandbox/.bash_profile 2>/dev/null || true)" = "$current_uid:$current_gid:444" ] \\
    && cmp -s "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" /sandbox/.bash_profile
}

verify_dcode_login_profile() {
  if [ -d /sandbox ] \\
    && [ ! -L /sandbox ] \\
    && [ -f "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" ] \\
    && [ ! -L "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" ] \\
    && [ "$(stat -c '%U:%G:%a' "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" 2>/dev/null || true)" = "root:root:444" ] \\
    && [ ! -L /sandbox/.bash_profile ] \\
    && [ "$(stat -c '%U:%G:%a' /sandbox 2>/dev/null || true)" = "root:sandbox:1775" ] \\
    && [ "$(stat -c '%U:%G:%a' /sandbox/.bash_profile 2>/dev/null || true)" = "root:root:444" ] \\
    && cmp -s "$NEMOCLAW_DCODE_LOGIN_PROFILE_SOURCE" /sandbox/.bash_profile; then
    return 0
  fi

  ${compatibilityMarker}
}`;

const source = await readFile(target, "utf8");
const verifierMatches = source.split(upstreamVerifier).length - 1;

if (source.includes(compatibilityMarker)) {
  throw new Error(
    "Refusing to patch NemoClaw: the TaskLattice Kubernetes profile compatibility path is already present; review and remove the downstream patch.",
  );
}
if (verifierMatches !== 1) {
  throw new Error(
    `Refusing to patch NemoClaw: expected one upstream DCode login-profile verifier, found ${verifierMatches}.`,
  );
}

await writeFile(target, source.replace(upstreamVerifier, patchedVerifier), "utf8");
console.log(
  "Patched NemoClaw Deep Agents login-profile verification for OpenShell Kubernetes workspaces.",
);
