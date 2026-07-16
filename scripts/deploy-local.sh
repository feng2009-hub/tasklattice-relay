#!/usr/bin/env bash
set -euo pipefail

overlay="${1:-openshell}"
case "$overlay" in
  local | openshell) ;;
  *)
    echo "usage: $0 [local|openshell]" >&2
    exit 2
    ;;
esac

kubectl apply -f infra/kubernetes/base/namespace.yaml
kubectl apply -k "infra/kubernetes/overlays/$overlay"
