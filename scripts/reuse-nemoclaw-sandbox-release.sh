#!/usr/bin/env bash
set -euo pipefail

sandbox_release="${TALI_SANDBOX_RELEASE_VERSION:-0.2.2}"
sandbox_release="${sandbox_release#v}"
release_registry="${TALI_SANDBOX_RELEASE_REGISTRY:-ghcr.io/tasklattice}"
development_registry="${TALI_IMAGE_REGISTRY:-ghcr.io/tasklattice}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Required command is not installed: docker" >&2
  exit 1
fi

for repository in tali-nemoclaw-sandbox tali-nemoclaw-hermes-sandbox; do
  release_image="$release_registry/$repository:$sandbox_release"
  development_image="$development_registry/$repository:dev"

  docker pull "$release_image"
  docker tag "$release_image" "$development_image"

  echo "Prepared $development_image from $release_image."
done
