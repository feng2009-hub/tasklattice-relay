{{- define "tasklattice.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "tasklattice.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "tasklattice.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end }}

{{- define "tasklattice.componentName" -}}
{{- printf "%s-%s" (include "tasklattice.fullname" .root) .component | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "tasklattice.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: tasklattice
{{- end }}

{{- define "tasklattice.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tasklattice.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "tasklattice.image" -}}
{{- $registry := trimSuffix "/" .root.Values.global.imageRegistry -}}
{{- $repository := .image.repository -}}
{{- if or (not (hasKey .image "useGlobalRegistry")) .image.useGlobalRegistry -}}
{{- printf "%s/%s:%s" $registry $repository (default .root.Chart.AppVersion .image.tag) -}}
{{- else -}}
{{- printf "%s:%s" $repository (default .root.Chart.AppVersion .image.tag) -}}
{{- end -}}
{{- end }}

{{- define "tasklattice.secretName" -}}
{{- default (include "tasklattice.componentName" (dict "root" . "component" "secrets")) .Values.secrets.existingSecret -}}
{{- end }}

{{- define "tasklattice.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "tasklattice.componentName" (dict "root" . "component" "control")) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when serviceAccount.create=false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}

{{- define "tasklattice.databaseUrl" -}}
{{- if .Values.secrets.databaseUrl -}}
{{- .Values.secrets.databaseUrl -}}
{{- else -}}
{{- printf "postgresql://litellm:%s@%s:5432/litellm" .Values.secrets.postgresPassword (include "tasklattice.componentName" (dict "root" . "component" "postgresql")) -}}
{{- end -}}
{{- end }}

