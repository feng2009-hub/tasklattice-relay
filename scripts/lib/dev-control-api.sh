#!/usr/bin/env bash

# Shared authenticated Control API helpers for local deployment configuration.
# The caller owns control_origin and cookie_file so multiple scripts can reuse
# the same behavior without persisting a development credential on disk.

dev_control_api_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  local response
  local request_args=(
    --silent
    --show-error
    --fail-with-body
    --connect-timeout 10
    --max-time "${CONTROL_API_TIMEOUT_SECONDS:-600}"
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

dev_control_login() {
  local username="${CONTROL_LOCAL_ADMIN_USERNAME:-admin}"
  local configured_password="${CONTROL_LOCAL_ADMIN_PASSWORD:-password}"
  local password_candidates=("$configured_password")
  local response=""

  # The bootstrap credential is intentionally create-only. Let an existing
  # local cluster created before the password default changed complete one
  # non-destructive upgrade, while fresh installs and documented defaults use
  # only `password`. An explicitly supplied password never falls back.
  if [[ -z "${CONTROL_LOCAL_ADMIN_PASSWORD+x}" && "$configured_password" != "admin" ]]; then
    password_candidates+=("admin")
  fi

  local candidate
  for candidate in "${password_candidates[@]}"; do
    local login_payload
    login_payload="$({
      jq --null-input \
        --arg username "$username" \
        --arg password "$candidate" \
        '{username: $username, password: $password}'
    })"
    if response="$(
      curl \
        --silent \
        --show-error \
        --fail-with-body \
        --connect-timeout 10 \
        --max-time 30 \
        --cookie-jar "$cookie_file" \
        --header "origin: $control_origin" \
        --header "content-type: application/json" \
        --request POST \
        --data "$login_payload" \
        "$control_origin/api/auth/sign-in/username"
    )"; then
      if [[ "$candidate" != "$configured_password" ]]; then
        echo "Using the legacy local development password for this existing database; new installations use password." >&2
      fi
      return 0
    fi
  done

  local detail
  detail="$(jq -r '.detail // .message // .error // empty' <<<"$response" 2>/dev/null || true)"
  echo "Unable to sign in to Control with the local administrator${detail:+: $detail}" >&2
  echo "Set CONTROL_LOCAL_ADMIN_USERNAME and CONTROL_LOCAL_ADMIN_PASSWORD if the development credentials changed." >&2
  return 1
}
