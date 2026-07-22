#!/usr/bin/env bash
set -euo pipefail

action="${1:-deploy}"
release_name="${HELM_RELEASE_NAME:-tasklattice}"
namespace="${HELM_NAMESPACE:-tasklattice-sandboxes}"
helm_timeout="${HELM_TIMEOUT:-15m}"
image_registry="ghcr.io/sn0rt"
image_tag="dev"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$action" in
  deploy | delete) ;;
  *)
    echo "usage: $0 [deploy|delete]" >&2
    exit 2
    ;;
esac

required_commands=(helm kubectl)
if [[ "$action" == "deploy" ]]; then
  required_commands+=(docker)
fi
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

if [[ -n "${KUBE_CONTEXT:-}" ]]; then
  kube_context="$KUBE_CONTEXT"
elif kube_context="$(kubectl config current-context 2>/dev/null)" && [[ -n "$kube_context" ]]; then
  :
elif kubectl config get-contexts orbstack >/dev/null 2>&1; then
  kube_context="orbstack"
else
  echo "No Kubernetes context is selected. Set KUBE_CONTEXT explicitly." >&2
  exit 1
fi

if ! kubectl config get-contexts "$kube_context" >/dev/null 2>&1; then
  echo "Kubernetes context does not exist: $kube_context" >&2
  exit 1
fi

if ! kubectl --context "$kube_context" version --request-timeout=10s >/dev/null 2>&1; then
  echo "Kubernetes cluster is not reachable through context: $kube_context" >&2
  exit 1
fi

if [[ "$action" == "delete" ]]; then
  if helm --kube-context "$kube_context" --namespace "$namespace" status "$release_name" >/dev/null 2>&1; then
    helm --kube-context "$kube_context" --namespace "$namespace" uninstall "$release_name"
  else
    echo "Helm release does not exist: $namespace/$release_name"
  fi
  exit 0
fi

images=(
  "$image_registry/tasklattice-control:$image_tag"
  "$image_registry/tasklattice-openshell-runner:$image_tag"
  "$image_registry/tasklattice-litellm:$image_tag"
  "$image_registry/tasklattice-nemoclaw-sandbox:$image_tag"
  "$image_registry/tasklattice-nemoclaw-hermes-sandbox:$image_tag"
)

missing_images=()
for image_name in "${images[@]}"; do
  if ! docker image inspect "$image_name" >/dev/null 2>&1; then
    missing_images+=("$image_name")
  fi
done
if (( ${#missing_images[@]} > 0 )); then
  echo "Build all local development images before deploying:" >&2
  printf '  %s\n' "${missing_images[@]}" >&2
  echo "Run: npm run images:build" >&2
  exit 1
fi

if [[ "$kube_context" == kind-* ]]; then
  if ! command -v kind >/dev/null 2>&1; then
    echo "The kind CLI is required to load local images into $kube_context." >&2
    exit 1
  fi
  kind load docker-image --name "${kube_context#kind-}" "${images[@]}"
fi

rollout_revision="dev-$(date -u +%Y%m%d%H%M%S)"

helm lint "$repository_root/charts/tasklattice" \
  --values "$repository_root/charts/tasklattice/values-dev.yaml"
helm upgrade --install "$release_name" "$repository_root/charts/tasklattice" \
  --kube-context "$kube_context" \
  --namespace "$namespace" \
  --create-namespace \
  --values "$repository_root/charts/tasklattice/values-dev.yaml" \
  --set-string "global.rolloutRevision=$rollout_revision" \
  --wait \
  --wait-for-jobs \
  --timeout "$helm_timeout"

kubectl --context "$kube_context" --namespace "$namespace" get pods,services,pvc
helm --kube-context "$kube_context" --namespace "$namespace" status "$release_name"
