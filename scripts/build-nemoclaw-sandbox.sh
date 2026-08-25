#!/usr/bin/env bash
set -euo pipefail

# Build one of the Agent implementations supported by the NemoClaw runtime.
# The reviewed NemoClaw release tag supplies both supported Agent integrations.
readonly AGENT_PLATFORM="${NEMOCLAW_AGENT_PLATFORM:-openclaw}"
readonly BUILD_OUTPUT="${NEMOCLAW_BUILD_OUTPUT:-local}"
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "${TALI_REQUIRE_DECLARED_DEPENDENCIES:-0}" = "1" ] \
  && [ -z "${NEMOCLAW_VERSION:-}" ]; then
  echo "Release dependency variable is required: NEMOCLAW_VERSION" >&2
  exit 2
fi
readonly NEMOCLAW_VERSION="${NEMOCLAW_VERSION:-v0.0.114}"

bash "$REPOSITORY_ROOT/scripts/write-release-dependencies.sh"

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
      NEMOCLAW_VERSION
    )
    require_declared_dependencies
    readonly NEMOCLAW_BASE_IMAGE="ghcr.io/nvidia/nemoclaw/sandbox-base:${NEMOCLAW_VERSION}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_IMAGE:-ghcr.io/tasklattice/tali-nemoclaw-sandbox:dev}"
    readonly DOCKERFILE="Dockerfile"
    readonly DEFAULT_UPSTREAM_IMAGE="tali-nemoclaw-openclaw-upstream:${NEMOCLAW_VERSION#v}"
    readonly WRAPPER_DOCKERFILE="$REPOSITORY_ROOT/infra/docker/Dockerfile.nemoclaw-openclaw"
    ;;
  hermes)
    required_variables=(
      NEMOCLAW_VERSION
    )
    require_declared_dependencies
    readonly NEMOCLAW_BASE_IMAGE="ghcr.io/nvidia/nemoclaw/hermes-sandbox-base:${NEMOCLAW_VERSION}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_HERMES_IMAGE:-ghcr.io/tasklattice/tali-nemoclaw-hermes-sandbox:dev}"
    readonly DOCKERFILE="agents/hermes/Dockerfile"
    readonly DEFAULT_UPSTREAM_IMAGE="tali-nemoclaw-hermes-upstream:${NEMOCLAW_VERSION#v}"
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
git -C "$build_context" checkout --quiet "$NEMOCLAW_VERSION"

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
    resolved_base_image="${NEMOCLAW_FALLBACK_BASE_IMAGE:-tali-nemoclaw-hermes-base:${NEMOCLAW_VERSION#v}}"
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
