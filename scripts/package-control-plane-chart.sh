#!/usr/bin/env bash
set -euo pipefail

required_commands=(cp helm sed)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-0.0.0-dev}"
image_registry="${TALI_IMAGE_REGISTRY:-ghcr.io/tasklattice}"
chart_root="$repository_root/charts/tali-relay"
output_root="$repository_root/dist/control-plane-chart"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/tali-control-chart.XXXXXX")"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

bash "$repository_root/scripts/prepare-helm-dependencies.sh"
cp -R "$chart_root" "$work_dir/tali-relay"
sed -i.bak \
  "s|imageRegistry: ghcr.io/tasklattice|imageRegistry: ${image_registry}|" \
  "$work_dir/tali-relay/values.yaml"
rm -f "$work_dir/tali-relay/values.yaml.bak"

mkdir -p "$output_root"
helm lint "$work_dir/tali-relay"
helm package "$work_dir/tali-relay" \
  --version "$version" \
  --app-version "$version" \
  --destination "$work_dir/packaged" >/dev/null
cp "$work_dir/packaged/tali-relay-${version}.tgz" "$output_root/tali-relay.tgz"

echo "Packaged complete TaskLattice Relay Helm chart at $output_root/tali-relay.tgz"
