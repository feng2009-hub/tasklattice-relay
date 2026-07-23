# Model Profile interaction design

Status: Implemented full-stack domain

## Product definition

A **Model Profile** is the single model-facing object an operator creates and
an Instance consumes. It gives one name to the complete inference contract:

```text
Provider connections and model deployments
  → LiteLLM public alias and routing behavior
  → compliance, isolated credentials, audit, and lifecycle
  → consuming Instances
```

The Instance workflow no longer asks an operator to reason about Provider
accounts, deployments, or routing internals. Those are upstream implementation
details of the Profile.

## Information architecture

The Models navigation contains:

- **Model Profiles**: the primary workspace for profile readiness, upstream
  inventory, creation, and consumption.
- **Cost**: usage and cost evidence across profiles, models, connections, and
  Instances.

The Model Profiles workspace has two ordered scopes:

1. **Profiles** — reusable choices exposed to Agent and Instance workflows.
2. **Upstream resource pool** — provider credentials and model deployments
   available to LiteLLM routing.

The Profile detail page contains:

- **Overview** — stable contract, end-to-end inference path, readiness.
- **Routing & upstream** — public alias, detected capabilities, and available
  upstream inventory.
- **Access & policy** — identity, credentials, compliance, audit, lifecycle.
- **Consumers** — Instances and their isolated key fingerprints.
- **Audit** — control-plane history.

## Domain boundaries

TaskLattice owns the Profile identity, readiness boundary, compliance gate,
per-Instance Virtual Key lifecycle, consumer relationship, and audit trail.

LiteLLM remains the source of truth for actual router candidates, weights,
tiers, retries, cooldowns, fallbacks, and provider selection. The current API
does not expose a trustworthy Profile-to-deployment candidate graph, so the UI
labels registered Provider models as an **available upstream pool** and never
claims that every registered model belongs to the selected Profile.

## Primary workflows

### Create a Profile

1. Define the consumer-facing name and description.
2. Select a validated, compliance-compatible model from the upstream pool.
   TaskLattice uses its registered LiteLLM model name as the Profile binding.
   Binding an existing router alias remains available as an advanced option.
3. Review inherited routing boundary, upstream readiness, compliance,
   per-Instance credentials, and audit policy.
4. Create and validate the Profile.

### Add an upstream

The Provider registration drawer is opened inside the Model Profiles
workspace. Provider selection, credential configuration, model discovery, and
registration remain one progressive flow, but their purpose is framed as
supplying the upstream pool for Profiles.

### Consume a Profile

A READY Profile can start the Create Instance flow. Instance creation and
Instance detail consistently display **Model Profile**, including its routing,
compliance, and failover summary.

## API and persistence

Model Profiles are first-class resources across contracts, control-plane
services, REST routes, LiteLLM metadata, audit events, Agent bindings, and
PostgreSQL persistence. The canonical collection is
`/api/v1/model-profiles`; resource routes use `{profileId}`. There are no
legacy aliases.

Development databases created from the earlier schema must be recreated; the
initial migration is intentionally destructive during this development phase.
