# Project Administrator guide

Set the Project boundary, enable the team, and remain accountable for resources, runtime, policy, and evidence.

## Establish the Project

1. **Confirm identity and Project scope.** Use the Project switcher before every administrative change. Project names and IDs are durable ownership boundaries, not display-only labels. [Open Project overview](/__project__).
2. **Invite members and assign the narrowest role.** In Project Settings, add people as Administrator, Developer, Reviewer, Auditor, or User. Keep at least one administrator and review stale memberships regularly. [Open Project Settings](/__project__/setting).
3. **Connect models and set routing.** Register provider accounts, validate models, choose a default routing configuration, and set a Project budget before production use. [Open models and routing](/__project__/setting).

## Enable safe Agent delivery

- **Curate capabilities.** Publish approved Skills, MCP connections, and Knowledge Sources before developers bind them to an Agent. [Open Skills](/__project__/skills).
- **Define access and runtime policy.** Use access policies for tool and data boundaries, and runtime policies for the execution envelope. Review the effective policy before provisioning. [Open Access Policies](/__project__/access-policies).
- **Review runtime state.** Treat READY as an observed state. Investigate provisioning logs and health signals before assigning a new Instance to users. [Open Runtime Instances](/__project__/instances).

## Operate with evidence

- **Watch usage, cost, and quota.** Compare spend and activity with the Project budget. Investigate attribution gaps instead of treating missing usage as zero risk. [Open Cost](/__project__/cost).
- **Review decisions and activity.** Use traces for execution behavior and Audit Logs for administrative actions, authorization decisions, and retained metadata. [Open Audit Logs](/__project__/audit-logs).
- **Handle destructive changes deliberately.** Project and Instance deletion can affect isolated resources. Review impact, preserve required evidence, and communicate a recovery plan first. [Open Project Settings](/__project__/setting).

> **Administrator is an accountable role.** It is not a shortcut around service-only approval execution. Use the narrowest human role for day-to-day work and keep administrative activity auditable.
