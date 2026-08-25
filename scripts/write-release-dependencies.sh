#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_file="${1:-$repository_root/dist/release-dependencies.json}"

if [[ "${TALI_REQUIRE_DECLARED_DEPENDENCIES:-0}" == "1" ]]; then
  required_variables=(
    OPENSHELL_VERSION
    NEMOCLAW_VERSION
    AGENT_SANDBOX_VERSION
    AGENT_SANDBOX_CHART_VERSION
    LITELLM_IMAGE
  )
  for variable_name in "${required_variables[@]}"; do
    if [[ -z "${!variable_name:-}" ]]; then
      echo "Release dependency variable is required: $variable_name" >&2
      exit 2
    fi
  done
fi

openshell_version="${OPENSHELL_VERSION:-0.0.106}"
nemoclaw_version="${NEMOCLAW_VERSION:-v0.0.114}"
agent_sandbox_version="${AGENT_SANDBOX_VERSION:-v0.5.1}"
agent_sandbox_chart_version="${AGENT_SANDBOX_CHART_VERSION:-0.1.0}"
litellm_image="${LITELLM_IMAGE:-litellm/litellm-database:v1.87.0}"

mkdir -p "$(dirname "$output_file")"
cat > "$output_file" <<EOF
{
  "openShell": "${openshell_version}",
  "nemoClaw": "${nemoclaw_version}",
  "agentSandbox": {
    "version": "${agent_sandbox_version}",
    "chartVersion": "${agent_sandbox_chart_version}"
  },
  "liteLlmImage": "${litellm_image}"
}
EOF

echo "Wrote release dependency compatibility set to $output_file"
