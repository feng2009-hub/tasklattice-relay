# TaskLattice Guard overlay for LiteLLM v1.87.0

This version-locked overlay adds `tasklattice_guard` as a first-class LiteLLM
Guardrail Provider. The runtime reuses LiteLLM's Generic Guardrail API protocol,
while the Admin UI exposes only the TaskLattice Integration endpoint and secret.
The same branded connection is listed in both the Provider picker and the
Guardrail Garden Partner catalog. Its Garden page explains the protection and
connection model before the standard Create Guardrail action opens the two-field
connection flow.

`apply-overlay.py` refuses to patch an unexpected LiteLLM source tree. A LiteLLM
upgrade therefore requires a new version directory and an explicit review.
