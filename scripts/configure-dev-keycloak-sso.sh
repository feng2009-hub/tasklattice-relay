#!/usr/bin/env bash
set -euo pipefail

control_public_url="${CONTROL_PUBLIC_URL:?CONTROL_PUBLIC_URL is required}"
keycloak_public_url="${KEYCLOAK_PUBLIC_URL:?KEYCLOAK_PUBLIC_URL is required}"
kube_context="${KUBE_CONTEXT:?KUBE_CONTEXT is required}"
namespace="${HELM_NAMESPACE:-tali}"
release_name="${HELM_RELEASE_NAME:-tali-relay}"
local_admin_username="${CONTROL_LOCAL_ADMIN_USERNAME:-admin}"
local_admin_password="${CONTROL_LOCAL_ADMIN_PASSWORD:-admin}"

for command_name in curl jq kubectl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

control_origin="${control_public_url%/}"
issuer="${keycloak_public_url%/}/realms/tali"
temporary_directory="$(mktemp -d)"
cookie_file="$temporary_directory/cookies.txt"
trap 'rm -r -- "$temporary_directory"' EXIT

api_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local response
  local request_args=(
    --silent
    --show-error
    --fail-with-body
    --cookie "$cookie_file"
    --header "origin: $control_origin"
    --header "content-type: application/json"
    --request "$method"
  )

  if [[ -n "$payload" ]]; then
    request_args+=(--data "$payload")
  fi

  if ! response="$(curl "${request_args[@]}" "$control_origin$path")"; then
    local detail
    detail="$(jq -r '.detail // .message // .error // empty' <<<"$response" 2>/dev/null || true)"
    echo "Control API request failed: $method $path${detail:+: $detail}" >&2
    return 1
  fi

  printf '%s' "$response"
}

login_payload="$({
  jq --null-input \
    --arg username "$local_admin_username" \
    --arg password "$local_admin_password" \
    '{username: $username, password: $password}'
})"

if ! login_response="$(
  curl \
    --silent \
    --show-error \
    --fail-with-body \
    --cookie-jar "$cookie_file" \
    --header "origin: $control_origin" \
    --header "content-type: application/json" \
    --request POST \
    --data "$login_payload" \
    "$control_origin/api/auth/sign-in/username"
)"; then
  detail="$(jq -r '.detail // .message // .error // empty' <<<"$login_response" 2>/dev/null || true)"
  echo "Unable to sign in to Control with the local administrator${detail:+: $detail}" >&2
  echo "Set CONTROL_LOCAL_ADMIN_USERNAME and CONTROL_LOCAL_ADMIN_PASSWORD if the development credentials changed." >&2
  exit 1
fi

secret_name="$({
  kubectl \
    --context "$kube_context" \
    --namespace "$namespace" \
    get secrets \
    --selector "app.kubernetes.io/instance=$release_name" \
    -o json |
    jq -r '
      [
        .items[]
        | select(.data["keycloak-client-secret"] != null)
        | .metadata.name
      ][0] // empty
    '
})"

if [[ -z "$secret_name" ]]; then
  echo "Unable to find the generated Keycloak Client secret for Helm release $namespace/$release_name." >&2
  exit 1
fi

keycloak_client_secret="$({
  kubectl \
    --context "$kube_context" \
    --namespace "$namespace" \
    get secret "$secret_name" \
    -o go-template='{{index .data "keycloak-client-secret" | base64decode}}'
})"

if [[ -z "$keycloak_client_secret" ]]; then
  echo "The Keycloak Client secret in $namespace/$secret_name is empty." >&2
  exit 1
fi

security_draft="$({
  jq --null-input \
    --arg issuer "$issuer" \
    --arg client_secret "$keycloak_client_secret" \
    '{
      localAuthenticationEnabled: true,
      sso: {
        enabled: true,
        displayName: "Keycloak",
        issuer: $issuer,
        clientId: "tali-control-plane",
        clientSecret: {
          action: "replace",
          value: $client_secret
        },
        groupClaim: "groups"
      }
    }'
})"

validation_response="$(api_request POST /api/v1/platform/security/validate "$security_draft")"
validation_token="$(jq -er '.validationToken | select(type == "string" and length > 0)' <<<"$validation_response")"
security_update="$(
  jq \
    --arg validation_token "$validation_token" \
    '. + {validationToken: $validation_token}' \
    <<<"$security_draft"
)"
api_request PUT /api/v1/platform/security "$security_update" >/dev/null

settings_response="$(api_request GET /api/v1/platform/settings)"
organization_response="$(api_request GET /api/v1/platform/organization)"

if ! jq -e \
  --arg issuer "$issuer" \
  '
    .security.localAuthenticationEnabled == true
    and .security.sso.enabled == true
    and .security.sso.issuer == $issuer
  ' <<<"$settings_response" >/dev/null; then
  echo "Control did not persist the expected Local authentication and SSO settings." >&2
  exit 1
fi

department_id="$({
  jq -r '
    [
      .departments[]?
      | select(.name == "dep1" or .id == "dep1")
      | .id
    ][0] // empty
  ' <<<"$organization_response"
})"

project_id="$({
  jq -r \
    --arg department_id "$department_id" \
    '
    [
      .departments[]?
      | select(.id == $department_id)
      | .projects[]?
      | select(.name == "proj1" or .id == "proj1")
      | .id
    ][0] // empty
  ' <<<"$organization_response"
})"

desired_bindings="$({
  jq --null-input \
    --arg department_id "$department_id" \
    --arg project_id "$project_id" \
    '[
      {
        enabled: true,
        group: "/tali/r/ROLE_PLATFORM_ADMIN",
        scope: "PLATFORM",
        departmentId: null,
        projectId: null,
        roleId: "ROLE_PLATFORM_ADMIN"
      }
    ]
    + (if $department_id == "" then [] else [
      {
        enabled: true,
        group: "/tali/d/dep1/r/ROLE_DEPARTMENT_ADMIN",
        scope: "DEPARTMENT",
        departmentId: $department_id,
        projectId: null,
        roleId: "ROLE_DEPARTMENT_ADMIN"
      }
    ] end)
    + (if $department_id == "" or $project_id == "" then [] else (
      [
        "ROLE_PROJECT_ADMIN",
        "ROLE_AUDITOR",
        "ROLE_AGENT_DEVELOPER",
        "ROLE_REVIEWER",
        "ROLE_USER"
      ]
      | map({
        enabled: true,
        group: ("/tali/d/dep1/p/proj1/r/" + .),
        scope: "PROJECT",
        departmentId: $department_id,
        projectId: $project_id,
        roleId: .
      })
    ) end)'
})"

role_bindings_update="$({
  jq \
    --argjson desired "$desired_bindings" \
    '
      def clean:
        with_entries(
          select(
            .key == "id"
            or .key == "enabled"
            or .key == "group"
            or .key == "scope"
            or .key == "departmentId"
            or .key == "projectId"
            or .key == "roleId"
          )
        );

      reduce $desired[] as $wanted (
        [(.security.sso.roleBindings // [])[] | clean];
        if any(.[]; .group == $wanted.group) then
          map(if .group == $wanted.group then . + $wanted else . end)
        else
          . + [$wanted]
        end
      )
      | {bindings: .}
    ' <<<"$settings_response"
})"

api_request PUT /api/v1/platform/security/role-bindings "$role_bindings_update" >/dev/null

auth_config="$(api_request GET /api/v1/auth/config)"
if [[ "$(jq -r '.ssoEnabled // false' <<<"$auth_config")" != "true" ]]; then
  echo "Control did not report SSO as enabled after saving the configuration." >&2
  exit 1
fi

signing_key_count="$(jq -r '.signingKeyCount // 0' <<<"$validation_response")"
role_binding_count="$(jq -r '.bindings | length' <<<"$role_bindings_update")"
echo "Configured Control SSO with Keycloak ($signing_key_count signing keys, $role_binding_count role bindings)."

if [[ -z "$department_id" || -z "$project_id" ]]; then
  echo "The dep1/proj1 development resources do not exist yet; their test role bindings will be added on the next deployment." >&2
fi
