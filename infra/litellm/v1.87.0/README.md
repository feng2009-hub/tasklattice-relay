# TaskLattice Guard overlay for LiteLLM v1.87.0

This version-locked overlay adds `tasklattice_guard` as a first-class LiteLLM
Guardrail Provider. The runtime reuses LiteLLM's Generic Guardrail API protocol.
The same branded connection is listed in both the Provider picker and the
Guardrail Garden Partner catalog. Its Garden page explains the protection and
connection model before the Create Guardrail action opens the managed setup
flow.

## Provider configuration

The setup flow requires the TaskLattice Integration base URL and its one-time
secret. The base URL must end in `/runtime/v1/integrations/{uuid}`; LiteLLM adds
the Generic Guardrail callback path itself. The secret is persisted through
LiteLLM Credentials and is never copied into the Guardrail record.

The following settings are owned and enforced by the LiteLLM provider. They do
not change the TaskLattice Integration protocol:

| Setting | Accepted values | Default | Runtime effect |
| --- | --- | --- | --- |
| Protection stages (`mode`) | `pre_call`, `post_call`, or both | both | Runs input protection before the model, output protection after the model, or both. At least one stage is required. |
| Guard unavailable (`unreachable_fallback`) | `fail_closed`, `fail_open` | `fail_closed` | Blocks when TaskLattice is unreachable, or continues without protection for network failures, timeouts, and HTTP 502/503/504. Policy blocks and other invalid responses are never bypassed. |
| Runtime timeout (`timeout_seconds`) | 1–60 seconds | 10 | Bounds each TaskLattice callback independently. A timeout follows the selected unavailable behavior. |
| Apply to every request (`default_on`) | `true`, `false` | `true` | Applies the Guardrail automatically, or only when a caller explicitly selects it. |

Creation verifies the Endpoint and Secret before persisting either record.
Editing policy settings does not require entering the secret again. Changing
the endpoint does require the secret again so that the new pair can be verified;
the existing credential remains unchanged for all other edits.

`fail_on_error` is intentionally not stored or exposed. LiteLLM v1.87.0's
Generic Guardrail API does not consume it, so presenting it would create a
configuration control with no runtime effect.

`apply-overlay.py` refuses to patch an unexpected LiteLLM source tree. A LiteLLM
upgrade therefore requires a new version directory and an explicit review.
