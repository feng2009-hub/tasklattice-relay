# Auditor guide

Review Project behavior, authorization, runtime, usage, and retained evidence without changing the system under review.

## Run an evidence review

1. **Define scope and time range.** Start with the Project, review objective, relevant actors, resources, and a bounded time window. Preserve the filters used for reproducibility. [Open Audit Logs](/__project__/audit-logs).
2. **Follow administrative and authorization activity.** Filter by actor, action, object type, and outcome. Distinguish denied attempts, failed operations, and successful changes. [Open audit filters](/__project__/audit-logs).
3. **Correlate execution evidence.** Use traces, runtime logs, configuration views, usage, and cost to test whether observed behavior matches the declared boundary. [Open Traces](/__project__/traces).
4. **Export and report carefully.** Record query criteria, timezone, export time, gaps, and integrity results. Treat missing or masked sensitive fields as an explicit evidence limitation. [Open audit export](/__project__/audit-logs).

## Read-only review areas

- **Resources and policies.** Inspect Agent configuration, Skills, MCP tools, Vector Databases, access policies, runtime policies, models, and routing without modifying them. [Open Access Policies](/__project__/access-policies).
- **Usage and cost.** Review attribution and data-quality signals as well as totals. An incomplete attribution chain must remain visible in the conclusion. [Open Cost](/__project__/cost).

> **Sensitive content remains bounded.** Audit access does not automatically reveal secrets, raw credentials, or every sensitive payload. Report masking as part of the evidence boundary rather than trying to bypass it.
