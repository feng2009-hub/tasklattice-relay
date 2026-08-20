{{- define "tali.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "tali.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "tali.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end }}

{{- define "tali.componentName" -}}
{{- printf "%s-%s" (include "tali.fullname" .root) .component | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "tali.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: tali
{{- end }}

{{- define "tali.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tali.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "tali.componentLabels" -}}
{{ include "tali.labels" .root }}
app.kubernetes.io/name: {{ include "tali.name" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "tali.argocdSyncWave" -}}
{{- index .root.Values.global.argocd.syncWaves .name -}}
{{- end }}

{{- define "tali.resourceAnnotations" -}}
{{- $annotations := deepCopy (default (dict) .annotations) -}}
{{- $_ := set $annotations "argocd.argoproj.io/sync-wave" (include "tali.argocdSyncWave" (dict "root" .root "name" .wave)) -}}
{{- toYaml $annotations -}}
{{- end }}

{{- define "tali.image" -}}
{{- $registry := trimSuffix "/" .root.Values.global.imageRegistry -}}
{{- $repository := .image.repository -}}
{{- if or (not (hasKey .image "useGlobalRegistry")) .image.useGlobalRegistry -}}
{{- printf "%s/%s:%s" $registry $repository (default .root.Chart.AppVersion .image.tag) -}}
{{- else -}}
{{- printf "%s:%s" $repository (default .root.Chart.AppVersion .image.tag) -}}
{{- end -}}
{{- end }}

{{- define "tali.secretName" -}}
{{- default (include "tali.componentName" (dict "root" . "component" "secrets")) .Values.secrets.existingSecret -}}
{{- end }}

{{- define "tali.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "tali.componentName" (dict "root" . "component" "control")) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when serviceAccount.create=false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}

{{- define "tali.runtimeServiceAccountName" -}}
{{- if .Values.serviceAccount.runtime.create -}}
{{- default (include "tali.componentName" (dict "root" . "component" "runtime")) .Values.serviceAccount.runtime.name -}}
{{- else -}}
{{- required "serviceAccount.runtime.name is required when serviceAccount.runtime.create=false" .Values.serviceAccount.runtime.name -}}
{{- end -}}
{{- end }}

{{- define "tali.databaseUrl" -}}
{{- if .Values.secrets.databaseUrl -}}
{{- .Values.secrets.databaseUrl -}}
{{- else -}}
{{- printf "postgresql://litellm:%s@%s:5432/litellm" .Values.secrets.postgresPassword (include "tali.componentName" (dict "root" . "component" "postgresql")) -}}
{{- end -}}
{{- end }}

{{- define "tali.controlConfig" -}}
{{- if not .Values.control.publicUrl -}}
{{- fail "control.publicUrl is required for Better Auth" -}}
{{- end -}}
{{- if and .Values.control.smtp.enabled (not .Values.control.publicUrl) -}}
{{- fail "control.publicUrl is required when SMTP invitations are enabled" -}}
{{- end -}}
{{- if and .Values.control.smtp.enabled (not .Values.control.smtp.host) -}}
{{- fail "control.smtp.host is required when SMTP invitations are enabled" -}}
{{- end -}}
{{- if and .Values.control.smtp.enabled (not .Values.control.smtp.fromAddress) -}}
{{- fail "control.smtp.fromAddress is required when SMTP invitations are enabled" -}}
{{- end -}}
{{- if and .Values.control.smtp.enabled (ne (empty .Values.control.smtp.username) (empty .Values.secrets.smtpPassword)) -}}
{{- fail "control.smtp.username and secrets.smtpPassword must be configured together" -}}
{{- end -}}
schema_version = 1

[server]
{{- with .Values.control.publicUrl }}
public_url = {{ . | quote }}
{{- end }}
internal_url = {{ printf "http://%s:%v" (include "tali.componentName" (dict "root" . "component" "control")) .Values.control.service.port | quote }}

[database]
url = {{ include "tali.databaseUrl" . | quote }}

[auth]
secret = {{ required "secrets.authSecret is required" .Values.secrets.authSecret | quote }}

[auth.local]
enabled = {{ .Values.auth.local.enabled }}
{{ if .Values.auth.local.enabled }}
initial_super_admin_username = {{ required "auth.local.username is required when Local authentication is enabled" .Values.auth.local.username | quote }}
initial_super_admin_email = {{ required "auth.local.email is required when Local authentication is enabled" .Values.auth.local.email | quote }}
initial_super_admin_password = {{ required "secrets.initialSuperAdminPassword is required when Local authentication is enabled" .Values.secrets.initialSuperAdminPassword | quote }}
{{ end }}

[auth.oidc]
enabled = {{ or .Values.auth.oidc.enabled .Values.keycloak.enabled }}
{{ if .Values.keycloak.enabled }}
display_name = "TaskLattice Relay Test SSO"
issuer = {{ printf "%s/realms/tali" (trimSuffix "/" (required "keycloak.publicUrl is required when the embedded Keycloak is enabled" .Values.keycloak.publicUrl)) | quote }}
client_id = "tali-control-plane"
client_secret = {{ required "secrets.keycloakClientSecret is required when the embedded Keycloak is enabled" .Values.secrets.keycloakClientSecret | quote }}
{{ else if .Values.auth.oidc.enabled }}
display_name = {{ .Values.auth.oidc.displayName | quote }}
issuer = {{ required "auth.oidc.issuer is required when OIDC is enabled" .Values.auth.oidc.issuer | quote }}
client_id = {{ required "auth.oidc.clientId is required when OIDC is enabled" .Values.auth.oidc.clientId | quote }}
client_secret = {{ .Values.auth.oidc.clientSecret | quote }}
{{ else }}
display_name = {{ .Values.auth.oidc.displayName | quote }}
issuer = ""
client_id = ""
client_secret = ""
{{ end }}

[runner]
url = {{ printf "http://%s:9090" (include "tali.componentName" (dict "root" . "component" "runner")) | quote }}
token = {{ required "secrets.runnerToken is required" .Values.secrets.runnerToken | quote }}

[litellm]
url = {{ printf "http://%s:4000" (include "tali.componentName" (dict "root" . "component" "litellm")) | quote }}
master_key = {{ required "secrets.litellmMasterKey is required" .Values.secrets.litellmMasterKey | quote }}

[smtp]
enabled = {{ .Values.control.smtp.enabled }}
host = {{ .Values.control.smtp.host | quote }}
port = {{ .Values.control.smtp.port }}
secure = {{ .Values.control.smtp.secure }}
username = {{ .Values.control.smtp.username | quote }}
password = {{ .Values.secrets.smtpPassword | quote }}
from_address = {{ .Values.control.smtp.fromAddress | quote }}
from_name = {{ .Values.control.smtp.fromName | quote }}
reply_to = {{ .Values.control.smtp.replyTo | quote }}
{{- end }}

{{- define "tali.controlConfigChecksum" -}}
{{- if .Values.secrets.existingSecret -}}
{{- printf "existing:%s" .Values.secrets.existingSecret | sha256sum -}}
{{- else -}}
{{- include "tali.controlConfig" . | sha256sum -}}
{{- end -}}
{{- end }}

{{- define "tali.runnerSecretChecksum" -}}
{{- if .Values.secrets.existingSecret -}}
{{- printf "existing:%s" .Values.secrets.existingSecret | sha256sum -}}
{{- else -}}
{{- printf "%s:%s" .Values.secrets.existingSecret .Values.secrets.runnerToken | sha256sum -}}
{{- end -}}
{{- end }}

{{- define "tali.postgresqlSecretChecksum" -}}
{{- if .Values.secrets.existingSecret -}}
{{- printf "existing:%s" .Values.secrets.existingSecret | sha256sum -}}
{{- else -}}
{{- printf "%s:%s" .Values.secrets.existingSecret .Values.secrets.postgresPassword | sha256sum -}}
{{- end -}}
{{- end }}

{{- define "tali.litellmSecretChecksum" -}}
{{- if .Values.secrets.existingSecret -}}
{{- printf "existing:%s" .Values.secrets.existingSecret | sha256sum -}}
{{- else -}}
{{- printf "%s:%s:%s:%s:%s:%s" .Values.secrets.existingSecret .Values.secrets.litellmMasterKey (include "tali.databaseUrl" .) .Values.secrets.litellmUiUsername .Values.secrets.litellmUiPassword .Values.secrets.litellmSaltKey | sha256sum -}}
{{- end -}}
{{- end }}

{{- define "tali.keycloakSecretChecksum" -}}
{{- printf "%s:%s:%s:%s" .Values.secrets.existingSecret .Values.secrets.keycloakAdminPassword .Values.secrets.keycloakClientSecret .Values.secrets.keycloakTestUserPassword | sha256sum -}}
{{- end }}
