#!/usr/bin/env bash
set -euo pipefail

# Build one of the Agent implementations supported by the NemoClaw runtime.
# Each platform pins its upstream revision and base image independently because
# OpenClaw and Hermes publish different integration manifests and image lines.
readonly AGENT_PLATFORM="${NEMOCLAW_AGENT_PLATFORM:-openclaw}"
readonly BUILD_OUTPUT="${NEMOCLAW_BUILD_OUTPUT:-local}"
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_declared_dependencies() {
  if [ "${TALI_REQUIRE_DECLARED_DEPENDENCIES:-0}" != "1" ]; then
    return
  fi
  for variable_name in "${required_variables[@]}"; do
    if [ -z "${!variable_name:-}" ]; then
      echo "Release dependency variable is required: $variable_name" >&2
      exit 2
    fi
  done
}

case "$AGENT_PLATFORM" in
  openclaw)
    required_variables=(
      NEMOCLAW_OPENCLAW_REVISION
      NEMOCLAW_OPENCLAW_BASE_IMAGE
    )
    require_declared_dependencies
    readonly NEMOCLAW_REVISION="${NEMOCLAW_OPENCLAW_REVISION:-2adc8481ff3053a5a7be37d130cb183e222934ff}"
    readonly NEMOCLAW_BASE_IMAGE="${NEMOCLAW_OPENCLAW_BASE_IMAGE:-ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:132dfea81026fe91581ab97d9034fb61d97b41a9951c7fd59d3d8b3b1b37b246}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_IMAGE:-ghcr.io/tasklattice/tali-nemoclaw-sandbox:dev}"
    readonly DOCKERFILE="Dockerfile"
    readonly DEFAULT_UPSTREAM_IMAGE="tali-nemoclaw-openclaw-upstream:${NEMOCLAW_REVISION:0:12}"
    readonly WRAPPER_DOCKERFILE="$REPOSITORY_ROOT/infra/docker/Dockerfile.nemoclaw-openclaw"
    ;;
  hermes)
    required_variables=(
      NEMOCLAW_HERMES_REVISION
      NEMOCLAW_HERMES_BASE_IMAGE
    )
    require_declared_dependencies
    readonly NEMOCLAW_REVISION="${NEMOCLAW_HERMES_REVISION:-c1bda8069d95a84a9e16b0d292a5fe20ce7cea7d}"
    readonly NEMOCLAW_BASE_IMAGE="${NEMOCLAW_HERMES_BASE_IMAGE:-ghcr.io/nvidia/nemoclaw/hermes-sandbox-base@sha256:fa05221f5c7bcafea7e263c84e5d06f87e37d1ccb78dc28c113f1a4066aa544c}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_HERMES_IMAGE:-ghcr.io/tasklattice/tali-nemoclaw-hermes-sandbox:dev}"
    readonly DOCKERFILE="agents/hermes/Dockerfile"
    readonly DEFAULT_UPSTREAM_IMAGE="tali-nemoclaw-hermes-upstream:${NEMOCLAW_REVISION:0:12}"
    readonly WRAPPER_DOCKERFILE="$REPOSITORY_ROOT/infra/docker/Dockerfile.nemoclaw-hermes"
    ;;
  *)
    echo "Unsupported NEMOCLAW_AGENT_PLATFORM: $AGENT_PLATFORM" >&2
    exit 2
    ;;
esac

case "$BUILD_OUTPUT" in
  local)
    readonly UPSTREAM_IMAGE="${NEMOCLAW_UPSTREAM_IMAGE:-$DEFAULT_UPSTREAM_IMAGE}"
    ;;
  push)
    if [ -z "${NEMOCLAW_UPSTREAM_IMAGE:-}" ]; then
      echo "NEMOCLAW_UPSTREAM_IMAGE is required when NEMOCLAW_BUILD_OUTPUT=push." >&2
      exit 2
    fi
    if [ -z "${DOCKER_DEFAULT_PLATFORM:-}" ]; then
      echo "DOCKER_DEFAULT_PLATFORM is required when NEMOCLAW_BUILD_OUTPUT=push." >&2
      exit 2
    fi
    readonly UPSTREAM_IMAGE="$NEMOCLAW_UPSTREAM_IMAGE"
    ;;
  *)
    echo "Unsupported NEMOCLAW_BUILD_OUTPUT: $BUILD_OUTPUT" >&2
    exit 2
    ;;
esac

build_image() {
  if [ "$BUILD_OUTPUT" = "push" ]; then
    docker buildx build \
      --platform "$DOCKER_DEFAULT_PLATFORM" \
      --push \
      "$@"
  else
    docker build "$@"
  fi
}

build_context="$(mktemp -d "${TMPDIR:-/tmp}/tali-nemoclaw.XXXXXX")"
trap 'rm -rf "$build_context"' EXIT

git clone --quiet --filter=blob:none https://github.com/NVIDIA/NemoClaw.git "$build_context"
git -C "$build_context" checkout --quiet "$NEMOCLAW_REVISION"

if [ "$AGENT_PLATFORM" = "openclaw" ]; then
  node "$REPOSITORY_ROOT/scripts/patch-nemoclaw-openclaw-no-proxy.mjs" \
    "$build_context/scripts/nemoclaw-start.sh"
fi

resolved_base_image="$NEMOCLAW_BASE_IMAGE"
if [ "$BUILD_OUTPUT" = "push" ]; then
  base_image_available() {
    docker buildx imagetools inspect "$resolved_base_image" >/dev/null 2>&1
  }
else
  base_image_available() {
    docker image inspect "$resolved_base_image" >/dev/null 2>&1 \
      || docker pull "$resolved_base_image"
  }
fi

if ! base_image_available; then
  if [ "$AGENT_PLATFORM" != "hermes" ]; then
    echo "Unable to resolve sandbox base image: $resolved_base_image" >&2
    exit 1
  fi

  if [ "$BUILD_OUTPUT" = "push" ]; then
    if [ -z "${NEMOCLAW_FALLBACK_BASE_IMAGE:-}" ]; then
      echo "NEMOCLAW_FALLBACK_BASE_IMAGE is required to publish the Hermes base fallback." >&2
      exit 2
    fi
    resolved_base_image="$NEMOCLAW_FALLBACK_BASE_IMAGE"
  else
    resolved_base_image="${NEMOCLAW_FALLBACK_BASE_IMAGE:-tali-nemoclaw-hermes-base:${NEMOCLAW_REVISION:0:12}}"
  fi

  if [ "$BUILD_OUTPUT" = "push" ] \
    || ! docker image inspect "$resolved_base_image" >/dev/null 2>&1; then
    echo "Hermes base image is unavailable from GHCR; building the pinned fallback."
    build_image \
      --file "$build_context/agents/hermes/Dockerfile.base" \
      --tag "$resolved_base_image" \
      "$build_context"
  fi
fi

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

build_image \
  --file "$build_context/$DOCKERFILE" \
  --build-arg "BASE_IMAGE=$resolved_base_image" \
  --build-arg NEMOCLAW_MODEL=deepseek-chat \
  --build-arg NEMOCLAW_PROVIDER_KEY=inference \
  --build-arg NEMOCLAW_INFERENCE_BASE_URL=https://inference.local/v1 \
  --build-arg NEMOCLAW_INFERENCE_API=openai-completions \
  --build-arg NEMOCLAW_CONTEXT_WINDOW=65536 \
  --build-arg NEMOCLAW_WEB_SEARCH_ENABLED=0 \
  "${platform_build_args[@]}" \
  --tag "$UPSTREAM_IMAGE" \
  "$build_context"

# Keep the pinned upstream Dockerfiles external while ensuring every published
# Agent image crosses a TaskLattice Relay-owned customization boundary.
build_image \
  --file "$WRAPPER_DOCKERFILE" \
  --build-arg "BASE_IMAGE=$UPSTREAM_IMAGE" \
  --tag "$NEMOCLAW_IMAGE" \
  "$REPOSITORY_ROOT"
