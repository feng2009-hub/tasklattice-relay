# Department Setting

Department Setting is the administration boundary between Platform defaults and
Project-owned configuration. It is visible only to a user who holds
`ROLE_DEPARTMENT_ADMIN` for the selected Department. Platform Administrator is
not an implicit bypass; a person who holds both roles sees both settings entries.

## Navigation and layout

The route is `/departments/:departmentId` and uses the same reusable
`ContextSidebarLayout` as Platform Setting. The secondary navigation contains:

- **General** — Department identity, Projects, and human membership.
- **Models** — model references copied to new Projects.
- **Routing** — the routing policy copied to new Projects.
- **Quota** — Department soft/hard boundaries and new Project allocations.

The Project switcher does not own Department administration. Department Setting
is a first-class entry in the primary sidebar.

## Inheritance

Model and routing defaults are a creation snapshot, not a live parent pointer.
When a Project is created, Relay stores the Department settings revision and the
model/routing references on that Project. Later Department changes affect only
new Projects. Provider credentials, registered models, and runtime routing
objects remain Project-owned.

Project quota defaults are copied into `project_quotas` at creation. If a
Department has a hard boundary but no explicit Project default, the new Project
starts with a zero allocation for that resource and must receive an allocation
before it can create resources.

## Soft and hard quota semantics

- A **soft quota** is an operational warning threshold. It never rejects work.
- A **hard quota** is an admission boundary.
- **Allocated** is the sum of limits reserved by child Projects.
- **Actual** is the resource count currently owned by child Projects.

Relay enforces a hard quota twice:

1. A Project quota update is rejected when the sum of child Project allocations
   would exceed the Department hard quota.
2. Resource admission is rejected when the actual Department-wide resource
   count has reached the hard quota, even if an individual Project still has
   local capacity.

When a hard boundary is introduced for an existing Department, unbounded child
Projects are normalized to their current actual resource count. This preserves
running resources without silently granting additional capacity. A hard limit
cannot be saved below existing actual use or allocated capacity.

Spend budgets follow the same allocation model. LiteLLM continues to enforce the
Project budget window, while Relay prevents the sum of Project budget
allocations from exceeding the Department hard budget.
