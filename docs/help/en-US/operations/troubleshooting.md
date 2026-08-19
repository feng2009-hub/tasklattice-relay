# Troubleshooting runbook

Find the first failing boundary, preserve evidence, and recover without turning an uncertain symptom into a destructive change.

## Triage sequence

1. **Define scope and recent change.** Record affected Projects, roles, Agents, start time, last known-good time, and recent releases or configuration changes. Decide whether the issue is UI, API, database, gateway, or runtime-wide.
2. **Inspect status before restarting.** Capture Pods, rollouts, events, and logs first. A restart can erase the timing and state needed to identify the cause.

   ~~~shell
   kubectl -n <namespace> get pods -o wide
   kubectl -n <namespace> get events --sort-by=.lastTimestamp
   helm -n <namespace> status <release>
   ~~~

3. **Follow the dependency chain.** Control depends on PostgreSQL and configured identity. Agent operations continue through Runner, OpenShell, the Agent Sandbox controller, sandbox images, LiteLLM, and the upstream provider.
4. **Recover the smallest boundary.** Prefer correcting the failed Secret, route, Pod, provider, or Instance over restarting the entire namespace. Verify both technical health and the original user path.

## Symptom guide

### Control UI is unavailable

Check Control rollout, Service endpoints, Route/Ingress, certificate, `control.toml` mount, and PostgreSQL connectivity. A healthy Pod with no endpoints is still unavailable.

~~~shell
kubectl -n <namespace> get deploy/<release>-control svc/<release>-control endpoints/<release>-control
kubectl -n <namespace> logs deployment/<release>-control --since=30m
~~~

### Sign-in fails

Check database reachability and user state. For OIDC, verify issuer discovery, redirect URL, client credentials, certificate trust, and clock skew. Do not reset accounts before preserving the authentication error.

### Instance is stuck provisioning

Inspect the Instance provisioning log, Runner, OpenShell gateway, sandbox resource, controller events, PVC, scheduling, and image-pull Secret. Confirm the desired state before retrying.

~~~shell
kubectl -n <namespace> get sandboxes,pods,pvc
kubectl -n <namespace> logs deployment/<release>-runner --since=30m
kubectl -n <namespace> logs deployment/agent-sandbox-controller --since=30m
~~~

### Model requests fail

Check LiteLLM health and logs, routing status, provider model name, network reachability, quota, and credential metadata. Never paste provider keys into logs or a support ticket.

~~~shell
kubectl -n <namespace> logs deployment/<release>-litellm --since=30m
~~~

### Usage, cost, or audit data is delayed

Confirm request completion, clock and timezone, ingestion services, database writes, selected time range, and attribution identifiers. Keep missing data distinct from a true zero.

## Escalation evidence

- **Include:** version, namespace, timestamps with timezone, affected resource IDs, sanitized error text, Pod states, relevant events, bounded logs, and steps already attempted.
- **Exclude:** passwords, session tokens, provider keys, full `control.toml`, private values, raw personal data, or complete prompts and model responses unless an approved secure channel requires them.

> **Database rollback is not an ordinary application rollback.** Do not downgrade or restore PostgreSQL merely because an application rollout failed. Stop, preserve evidence, check migration compatibility, and use a tested recovery plan with an explicit maintenance window.
