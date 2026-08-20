# Business API contracts

TaskLattice Relay uses a contract-first business API. Zod is the only source
for request and response schemas; OpenAPI is generated from the same route
contracts used by handlers for runtime parsing.

## Source layout

- `apps/control/server/api-contracts/contract.ts` defines the route contract.
- `apps/control/server/api-contracts/schemas.ts` owns shared business API Zod schemas.
- `*.contracts.ts` files group operations by domain.
- `apps/control/server/api-contracts/index.ts` is the complete registry.
- `apps/control/server/api-contracts/openapi.ts` generates OpenAPI 3.1.1.
- `apps/control/server/routes/api/v1/openapi.json.get.ts` publishes the document at `/api/v1/openapi.json`.

Better Auth owns the authentication protocol under `/api/auth`. Those protocol
routes are intentionally not copied into the Relay business API document.
`/api/v1/auth/me` and `/api/v1/auth/config` are business-facing session and
configuration projections.

## Domain language

- A Department is an organization and budget grouping. Department membership
  grants no Project business permission.
- A Project is the business, authorization, and runtime ownership boundary.
- A runtime workload is an Instance. “Agent” is reserved for Agent Garden
  registrations and collaboration protocols.
- Sandbox execution rules are Runtime Policies (`/runtime-policies`). Access
  Policies remain the separate tool/MCP authorization concept.

## Adding or changing an endpoint

1. Define or reuse the request and response Zod schemas.
2. Add the operation to one domain contract module, including its canonical
   path, operation ID, summary, tag, and success status.
3. Import the same input schema in the Nitro handler and parse the request.
4. Add the handler file. The route parity test fails if either the contract or
   handler is missing.
5. Run the control typecheck and tests.

All business API errors use RFC 9457 Problem Details with
`application/problem+json`. Project-scoped operations also expose their runtime
Capability admission requirements as `x-tali-capabilities` in OpenAPI.
