#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cluster_name="${KIND_CLUSTER_NAME:-tali-ci}"
kube_context="kind-${cluster_name}"
release_name="${HELM_RELEASE_NAME:-tali-relay}"
namespace="${HELM_NAMESPACE:-tali-smoke}"
image_registry="${IMAGE_REGISTRY:-ghcr.io/tasklattice}"
image_tag="${IMAGE_TAG:-latest}"
control_image_tag="${CONTROL_IMAGE_TAG:-$image_tag}"
control_image_pull_policy="${CONTROL_IMAGE_PULL_POLICY:-Always}"
helm_timeout="${HELM_TIMEOUT:-15m}"

for command_name in helm kind kubectl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

if ! kind get clusters | grep -Fxq "$cluster_name"; then
  echo "Kind cluster does not exist: $cluster_name" >&2
  exit 1
fi

if ! kubectl config get-contexts "$kube_context" >/dev/null 2>&1; then
  echo "kubectl context does not exist: $kube_context" >&2
  exit 1
fi

bash "$repository_root/scripts/prepare-helm-dependencies.sh"

helm upgrade --install "$release_name" "$repository_root/charts/tali-relay" \
  --kube-context "$kube_context" \
  --namespace "$namespace" \
  --create-namespace \
  --set-string "global.imageRegistry=$image_registry" \
  --set-string "images.control.tag=$control_image_tag" \
  --set-string "images.control.pullPolicy=$control_image_pull_policy" \
  --set-string "images.runner.tag=$image_tag" \
  --set "images.runner.pullPolicy=Always" \
  --set-string "images.litellm.tag=$image_tag" \
  --set "images.litellm.pullPolicy=Always" \
  --set-string "images.exampleMcp.tag=$image_tag" \
  --set "images.exampleMcp.pullPolicy=Always" \
  --set-string "images.openclawSandbox.tag=$image_tag" \
  --set-string "images.hermesSandbox.tag=$image_tag" \
  --set "control.service.type=ClusterIP" \
  --set "litellm.service.type=ClusterIP" \
  --set "openshell.service.type=ClusterIP" \
  --wait \
  --wait-for-jobs \
  --timeout "$helm_timeout"

kubectl --context "$kube_context" --namespace "$namespace" get pods,services
