# Model Guardrails Service

This standalone service exposes LiteLLM's Generic Guardrail API and evaluates
every request that reaches it with NVIDIA NeMo Guardrails. It intentionally owns only
provider-model input/output rails; Dialog, Retrieval, and Execution rails stay
inside an Agent runtime where the required lifecycle context exists.

LiteLLM calls the same endpoint for its pre-call, during-call, and post-call
hooks. Pre-call checks run before the provider request, during-call moderation
runs in parallel with the provider request, and post-call checks inspect either
the complete response or cumulative streaming chunks. The service preserves a
bounded in-memory call context so output rails can evaluate the originating
messages. It has no Project, Routing, Team, API Key, or Dashboard policy
dependency. LiteLLM alone decides whether a registered Guardrail is attached
to a model request.

Input and output violations return `BLOCKED`. LiteLLM rejects invalid input,
rejects a complete non-streaming response, or terminates an active streaming
response when its post-call streaming iterator detects a violation. Chunks
already delivered before a streaming violation are not retractable.

The bundled `model-io-default-v1` profile always runs deterministic secret and
test-marker checks. When `MODEL_GUARDRAILS_EVALUATOR_MODEL` and
`MODEL_GUARDRAILS_EVALUATOR_BASE_URL` are set, NeMo also runs real
model-backed rails. `MODEL_GUARDRAILS_EVALUATOR_KIND=self_check` uses the
configured OpenAI-compatible model for `self check input` and
`self check output`. `content_safety` uses NeMo's dedicated content-safety
input/output flows and a NIM-compatible endpoint. The credential is read only
from `MODEL_GUARDRAILS_EVALUATOR_API_KEY`.

The evaluator is an internal dependency of this standalone component. Its
provider, endpoint, model, and credential are configured through deployment
configuration and Kubernetes Secrets, independently of Provider Accounts in
the TaskLattice Dashboard. The Dashboard may configure LiteLLM to attach or
detach the already-registered Guardrails, but it never controls this service's
process or policy state.

The Helm defaults describe NVIDIA's hosted
`nvidia/llama-3.1-nemotron-safety-guard-8b-v3` content-safety model. A DeepSeek
or other OpenAI-compatible endpoint can instead use `kind: self_check` with the
same service contract.

Streaming output is checked by LiteLLM's post-call streaming iterator. The
iterator samples cumulative chunks and terminates the stream when this service
returns `BLOCKED`; previously delivered chunks remain visible to the client.

Run locally:

```sh
python -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/pytest
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8091
```
