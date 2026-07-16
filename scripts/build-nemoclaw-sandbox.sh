#!/usr/bin/env bash
set -euo pipefail

# Build one of the Agent implementations supported by the NemoClaw runtime.
# Each platform pins its upstream revision and base image independently because
# OpenClaw and Hermes publish different integration manifests and image lines.
readonly AGENT_PLATFORM="${NEMOCLAW_AGENT_PLATFORM:-openclaw}"

case "$AGENT_PLATFORM" in
  openclaw)
    readonly NEMOCLAW_REVISION="${NEMOCLAW_REVISION:-2adc8481ff3053a5a7be37d130cb183e222934ff}"
    readonly NEMOCLAW_BASE_IMAGE="${NEMOCLAW_BASE_IMAGE:-ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:132dfea81026fe91581ab97d9034fb61d97b41a9951c7fd59d3d8b3b1b37b246}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_IMAGE:-tasklattice-nemoclaw-sandbox:0.3.0}"
    readonly DOCKERFILE="Dockerfile"
    ;;
  hermes)
    readonly NEMOCLAW_REVISION="${NEMOCLAW_HERMES_REVISION:-c1bda8069d95a84a9e16b0d292a5fe20ce7cea7d}"
    readonly NEMOCLAW_BASE_IMAGE="${NEMOCLAW_HERMES_BASE_IMAGE:-ghcr.io/nvidia/nemoclaw/hermes-sandbox-base@sha256:fa05221f5c7bcafea7e263c84e5d06f87e37d1ccb78dc28c113f1a4066aa544c}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_HERMES_IMAGE:-tasklattice-nemoclaw-hermes-sandbox:0.3.0}"
    readonly DOCKERFILE="agents/hermes/Dockerfile"
    ;;
  *)
    echo "Unsupported NEMOCLAW_AGENT_PLATFORM: $AGENT_PLATFORM" >&2
    exit 2
    ;;
esac

build_context="$(mktemp -d "${TMPDIR:-/tmp}/tasklattice-nemoclaw.XXXXXX")"
trap 'rm -rf "$build_context"' EXIT

git clone --quiet --filter=blob:none https://github.com/NVIDIA/NemoClaw.git "$build_context"
git -C "$build_context" checkout --quiet "$NEMOCLAW_REVISION"

platform_build_args=()
if [ "$AGENT_PLATFORM" = "openclaw" ]; then
  platform_build_args+=(
    --build-arg NEMOCLAW_PRIMARY_MODEL_REF=inference/deepseek-chat
    --build-arg NEMOCLAW_MAX_TOKENS=8192
    --build-arg NEMOCLAW_REASONING=false
  )
else
  platform_build_args+=(
    --build-arg NEMOCLAW_UPSTREAM_PROVIDER=deepseek
  )
fi

docker build \
  --file "$DOCKERFILE" \
  --build-arg "BASE_IMAGE=$NEMOCLAW_BASE_IMAGE" \
  --build-arg NEMOCLAW_MODEL=deepseek-chat \
  --build-arg NEMOCLAW_PROVIDER_KEY=inference \
  --build-arg NEMOCLAW_INFERENCE_BASE_URL=https://inference.local/v1 \
  --build-arg NEMOCLAW_INFERENCE_API=openai-completions \
  --build-arg NEMOCLAW_CONTEXT_WINDOW=65536 \
  --build-arg NEMOCLAW_WEB_SEARCH_ENABLED=0 \
  "${platform_build_args[@]}" \
  --tag "$NEMOCLAW_IMAGE" \
  "$build_context"
