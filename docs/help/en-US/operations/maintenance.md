# Daily maintenance runbook

Keep the control plane, runtime services, storage, and evidence path observable and recoverable through small, repeatable checks.

## Daily health check

1. **Confirm workload and storage state.** All expected Deployments and StatefulSets should be available. Investigate restarts, Pending Pods, and expanding PVC usage before they become user incidents.

   ~~~shell
   kubectl -n <namespace> get pods,services,pvc
   kubectl -n <namespace> get deploy,statefulset
   ~~~

2. **Review recent cluster events.** Look for scheduling, volume, probe, image-pull, admission, and certificate failures. Correlate events with rollout or configuration changes.

   ~~~shell
   kubectl -n <namespace> get events --sort-by=.lastTimestamp
   ~~~

3. **Check control and runtime signals.** Review Control, Runner, LiteLLM, OpenShell, and Agent Sandbox controller logs for repeated errors. Use a bounded time window to avoid hiding the first failure.

   ~~~shell
   kubectl -n <namespace> logs deployment/<release>-control --since=1h
   kubectl -n <namespace> logs deployment/<release>-runner --since=1h
   kubectl -n <namespace> logs deployment/<release>-litellm --since=1h
   ~~~

4. **Verify the user-facing path.** Sign in with a non-emergency account, open a Project, confirm overview data loads, and verify one known-good Agent without changing production state.

## Planned maintenance

- **Back up and rehearse restore.** Back up PostgreSQL before schema-affecting upgrades. Protect the dump as sensitive data and regularly restore it into an isolated environment to prove recoverability.

  ~~~shell
  kubectl -n <namespace> exec statefulset/<release>-postgresql -- \
    pg_dump -U <db-user> -d <database> --format=custom > tali-backup.dump
  ~~~

- **Review configuration and secrets.** Keep deployed `control.toml` and private values outside source control. Rotate signing, database, gateway, provider, SMTP, registry, and OIDC credentials through an approved process.
- **Upgrade with rollout gates.** Read release notes, render the chart, preserve private values, back up the database, and use Helm's wait timeout. Verify each workload before accepting the change.

  ~~~shell
  helm upgrade --install <release> <chart> \
    -n <namespace> -f <private-values.yaml> --wait --timeout 30m
  kubectl -n <namespace> rollout status deployment/<release>-control --timeout=300s
  ~~~

- **Keep an operations record.** Record the operator, reason, version, values change, start/end time, verification evidence, and rollback or recovery decision.

> **Do not use development defaults in shared environments.** Replace every default secret, configure TLS and identity appropriately, protect registry credentials, and ensure the Agent Sandbox security model is accepted by the cluster owner.
