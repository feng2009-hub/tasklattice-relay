#!/usr/bin/env bash

set -euo pipefail

cluster_name="${KIND_CLUSTER_NAME:-tasklattice-ci}"
kube_context="kind-${cluster_name}"
release_name="${HELM_RELEASE_NAME:-tasklattice}"
namespace="${HELM_NAMESPACE:-tasklattice-smoke}"
image_registry="${IMAGE_REGISTRY:-tasklattice.local}"
helm_timeout="${HELM_TIMEOUT:-15m}"
build_images="${BUILD_IMAGES:-1}"

if [[ -n "${IMAGE_TAG:-}" ]]; then
  image_tag="${IMAGE_TAG}"
elif [[ "${build_images}" == "1" ]]; then
  image_tag="kind-smoke-$(date +%s)"
else
  echo "IMAGE_TAG is required when BUILD_IMAGES=0." >&2
  exit 1
fi

required_commands=(docker helm kind kubectl)
for command_name in "${required_commands[@]}"; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is not installed: ${command_name}" >&2
    exit 1
  fi
done

if ! kind get clusters | grep -Fxq "${cluster_name}"; then
  echo "Kind cluster does not exist: ${cluster_name}" >&2
  echo "Create it first or set KIND_CLUSTER_NAME to an existing cluster." >&2
  exit 1
fi

if ! kubectl config get-contexts "${kube_context}" >/dev/null 2>&1; then
  echo "kubectl context does not exist: ${kube_context}" >&2
  exit 1
fi

control_image="${image_registry}/tasklattice-control:${image_tag}"
runner_image="${image_registry}/tasklattice-openshell-runner:${image_tag}"
litellm_image="${image_registry}/tasklattice-litellm:${image_tag}"

if [[ "${build_images}" == "1" ]]; then
  docker build \
    --file infra/docker/Dockerfile \
    --target control \
    --tag "${control_image}" \
    .
  docker build \
    --file infra/docker/Dockerfile \
    --target runner \
    --tag "${runner_image}" \
    .
  docker build \
    --file infra/docker/Dockerfile.litellm \
    --tag "${litellm_image}" \
    .
elif [[ "${build_images}" != "0" ]]; then
  echo "BUILD_IMAGES must be 0 or 1." >&2
  exit 1
fi

kind load docker-image --name "${cluster_name}" \
  "${control_image}" \
  "${runner_image}" \
  "${litellm_image}"

helm lint charts/tasklattice
helm upgrade --install "${release_name}" charts/tasklattice \
  --kube-context "${kube_context}" \
  --namespace "${namespace}" \
  --create-namespace \
  --set-string "global.imageRegistry=${image_registry}" \
  --set-string "images.control.tag=${image_tag}" \
  --set-string "images.runner.tag=${image_tag}" \
  --set-string "images.litellm.tag=${image_tag}" \
  --set "control.service.type=ClusterIP" \
  --set "openshell.service.type=ClusterIP" \
  --wait \
  --wait-for-jobs \
  --timeout "${helm_timeout}"

kubectl --context "${kube_context}" --namespace "${namespace}" wait \
  --for=condition=Ready pod \
  --all \
  --timeout="${helm_timeout}"
kubectl --context "${kube_context}" --namespace agent-sandbox-system wait \
  --for=condition=Ready pod \
  --all \
  --timeout="${helm_timeout}"

for required_namespace in "${namespace}" agent-sandbox-system; do
  pod_count="$(kubectl --context "${kube_context}" --namespace "${required_namespace}" get pods --no-headers | wc -l | tr -d ' ')"
  if [[ "${pod_count}" == "0" ]]; then
    echo "No Pods were created in namespace ${required_namespace}." >&2
    exit 1
  fi
  kubectl --context "${kube_context}" --namespace "${required_namespace}" get pods -o wide
done

helm --kube-context "${kube_context}" --namespace "${namespace}" status "${release_name}"
