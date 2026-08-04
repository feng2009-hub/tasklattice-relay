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

The bundled `model-io-default-v1` profile runs a sequential three-stage policy:

1. Colang actions block high-confidence secrets, identifiers, and configured
   static markers without a model call.
2. NVIDIA Nemotron Safety Guard checks input and output against its content
   safety taxonomy.
3. NVIDIA NemoGuard Topic Control checks input against the business-topic
   guidelines in `prompts.yml`.

Stages two and three are enabled by configuring their model names with one
NVIDIA NIM-compatible endpoint. Topic Control is input-only by design. If its
model is omitted, the first two stages continue to operate. The credential is
read only from `MODEL_GUARDRAILS_NVIDIA_API_KEY`.

```text
MODEL_GUARDRAILS_NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
MODEL_GUARDRAILS_CONTENT_SAFETY_MODEL=nvidia/llama-3.1-nemotron-safety-guard-8b-v3
MODEL_GUARDRAILS_TOPIC_CONTROL_MODEL=nvidia/llama-3.1-nemoguard-8b-topic-control
```

Provider configuration is an internal dependency of this standalone component.
It is independent of Provider Accounts in the TaskLattice Dashboard. The
Dashboard may configure LiteLLM to attach or detach the registered Guardrails,
but it never controls this service's process or policy state.

`MODEL_GUARDRAILS_PROFILE_PATH` is the policy extension boundary. Point it at a
NeMo Guardrails profile containing `config.yml`, Colang flows, prompts, and
optional Python actions. The service contract and LiteLLM integration do not
change when the profile changes.

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
