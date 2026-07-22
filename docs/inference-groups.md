# Inference Groups

An Inference Group is TaskLattice's stable access contract for routing managed in LiteLLM. TaskLattice owns the Gateway binding, compliance gate, per-Instance Virtual Key lifecycle, audit trail, and cost attribution. LiteLLM remains the source of truth for Auto Router tiers, deployments, routing policy, affinity, retries, cooldowns, fallbacks, and provider selection.

## Gateway configuration

The built-in Gateway is configured through environment variables:

- `LITELLM_BASE_URL`: LiteLLM API base URL, without `/v1`.
- `LITELLM_ADMIN_UI_URL`: trusted administrator UI URL used by **Open in LiteLLM**.
- `LITELLM_MASTER_KEY`: control-plane credential. It is never returned by the API or passed to an Instance.
- `LITELLM_COMPLIANCE_DOMAIN`: `CN_MAINLAND` or `GLOBAL`. It defaults to `GLOBAL` and is inherited by new Inference Groups.

Every Instance receives a separate Team-scoped Virtual Key restricted to the group's public model alias. Only the key fingerprint and LiteLLM token identifier are persisted; plaintext key material exists only while the Sandbox is being created.

## Operator interaction

The Inference Group detail page is the readiness boundary. A `READY` group is shown as **Configured correctly and ready for Instances** only after its LiteLLM binding, Gateway, compliance metadata, and supported capabilities pass validation. The page exposes the stable alias and a concise capability summary, while routing tiers, weights, retries, fallbacks, and provider selection remain in LiteLLM.

Operators can start **Use in new Instance** from a READY group. TaskLattice carries that group ID into the Instance workflow, displays the selected group name and compliance domain, and sends the group ID in the create request. The control plane then creates the Team-scoped Virtual Key and injects the selected Gateway endpoint and public model alias into the Sandbox. It never silently replaces an explicitly selected unavailable group with another default.

Opening the general Instance creation flow remains low-friction: TaskLattice selects the single READY default Inference Group automatically. The created Instance detail links back to the exact group that supplied its inference binding.

## Compliance boundary

Compliance is fail closed. The Gateway domain, Inference Group domain, and every effective LiteLLM Router candidate must match. Missing candidate metadata or a CN/Global mixture prevents the group from becoming `READY` and blocks new bindings.

For strict deployments, run CN Mainland and Global traffic through separate LiteLLM Gateways, databases, secrets, and network egress. Do not treat request tags, user agents, or client-supplied routing fields as a compliance boundary.

Each backing LiteLLM model must declare `model_info.compliance_domain`. TaskLattice Provider registration writes this metadata explicitly; provider names are never used to infer it.

## LiteLLM version capability

The repository currently pins `litellm/litellm-database:v1.86.2`. LiteLLM Auto Router v2 ships in v1.94.x, so an Auto Router group on an older or unreported Gateway is marked `UNSUPPORTED`. Upgrade the pinned image only after validating its database migration and the model, key, Team, spend-log, Provider registration, and Instance lifecycle APIs in the target environment.

TaskLattice inspects public management APIs and does not read LiteLLM's private PostgreSQL schema. Capabilities that cannot be established from the effective configuration are reported as `UNKNOWN`, never inferred as enabled.
