# LLM Evals

Learning scaffold for running evals against a model behind a policy gateway.

The repo is **Ollama-first**: run a model locally with Ollama, put a policy layer in front of it, and run eval suites against the policy layer.

## Mental model (how everything fits together)

Think of this repo as three layers:

1) **Provider (local model runtime)**: Ollama runs the model weights and exposes an HTTP API.
2) **Gateway (controls + policy)**: `apps/api` is the single control point where you enforce rules, redact/transform, and log decisions.
3) **Eval harness (measurement)**: `packages/evals` generates requests and scores the results so you can track regressions and guide improvements (and later, fine-tuning).

Data flow:

`packages/evals` → `apps/api` (policy) → `Ollama` (model) → `apps/api` (post-policy) → `packages/evals` (scores)

## Goals
- Learn how to design and run eval suites (regressions, security, integrity).
- Add layered controls (starting with PII) and measure their impact.
- Create a feedback loop that can later support fine-tuning (optional).

## Layout
- `apps/api`: Fastify policy gateway (OpenAI-compatible `/v1/chat/completions`).
- `apps/web`: Planned React UI for policy upload, test case editing, and results.
- `packages/evals`: CLI to run eval suites against the API gateway.
- `packages/evals/suites`: Eval suite definitions (JSONL).
- `docs`: Architecture + provider notes (Ollama, controls, roadmap).
- `docs/ROADMAP.md`: Phased plan for UI + persistence + fine-tuning.
- `infra/monitoring`: Prometheus + Grafana stack for metrics/dashboards.
- `models`: Optional local artifacts (ignored by git). With Ollama, weights usually do not live in this repo.

## Prereqs
- Node 20+
- pnpm 8+
- Ollama installed and running locally (serves on `http://127.0.0.1:11434`).
- Postgres (planned for UI + persistence; not required yet).

## Quickstart (Ollama + policy gateway + evals)
1) Start Ollama and pull a model:
   - `ollama pull <model>`
   - Example: `ollama pull llama3.1`
2) Configure the API gateway to use Ollama as upstream:
   - Copy `apps/api/.env.example` to `apps/api/.env`
   - Set `UPSTREAM_BASE_URL=http://127.0.0.1:11434`
   - Set the Postgres values (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
   - Recommended local DBs:
     - `llm_evals` for dev
     - `llm_evals_test` for tests (kept separate so tests can truncate safely)
3) Run the API gateway:
   - `pnpm install`
   - `pnpm dev:api` (listens on `PORT`, default `3000`)
4) Run evals:
   - `pnpm --filter evals build`
   - `pnpm --filter evals run http://localhost:3000 <model> <suite>`
     - Example: `pnpm --filter evals run http://localhost:3000 llama3.1 pii`

## Local dev (UI + API)
You will typically use two terminals: one for the API gateway and one for the UI.

1) Ensure Postgres is running and the dev DB exists:
   - `createdb llm_evals` (one-time)
2) Configure the API gateway:
   - Copy `apps/api/.env.example` to `apps/api/.env`
   - Fill in `DB_*` values (use `DB_NAME=llm_evals`)
3) Terminal 1 (API):
   - `pnpm install`
   - `pnpm dev:api`
4) Terminal 2 (UI):
   - `cd apps/web`
   - `pnpm install`
   - `pnpm dev`
5) Visit the UI:
   - `http://localhost:5173`

Optional: seed sample data
- `pnpm --filter api run seed`

## How to think about “downloading and running the open-source model”

This repo does **not** “import model weights” as a library dependency.

Instead:
- **Ollama** downloads and stores model weights in its own local cache/storage.
- This repo points at Ollama via `UPSTREAM_BASE_URL` and sends requests over HTTP.

That separation is intentional:
- keeps the git repo small and reviewable
- lets you swap models without changing code
- makes eval runs repeatable across machines (same gateway + same suite, with only the upstream model changing)

### Provider expectations (Ollama)
The gateway forwards to `{UPSTREAM_BASE_URL}/v1/chat/completions`.

Many Ollama installs expose OpenAI-compatible routes under `/v1/...`.
If your Ollama setup does not, the design still holds: we would add an Ollama-native provider adapter behind the gateway.

## Repo structure (what each piece contributes)

### `apps/api` — policy gateway
This is the **control point**. If you want to add a new security layer, guardrail, or control, it should usually live here.

Key files:
- `apps/api/src/index.ts`: HTTP server and request routing.
  - Validates incoming request shape.
  - Runs **pre-policy** on request messages.
  - Forwards to upstream model provider (Ollama by default).
  - Runs **post-policy** on model output (e.g., leakage checks).
  - Returns either the upstream response or a policy error.
- `apps/api/src/policy.ts`: policy logic.
  - Right now includes a PII detector (email/phone/SSN/credit card w/ Luhn).
  - This is where you grow a "pipeline" of controls over time.
- `apps/api/src/env.ts`: typed env config.
  - `UPSTREAM_BASE_URL`: where the model provider lives (default Ollama).
  - `POLICY_ENFORCEMENT`: `block` or `audit`.
- `apps/api/.env.example`: example env file to copy for local runs.

### `packages/evals` — eval runner
This package provides a minimal CLI that:
- loads a suite file
- sends each case to the gateway
- checks whether the outcome matches the suite expectations
- exits non-zero on failure (good for CI later)

Key files:
- `packages/evals/src/index.ts`: CLI entrypoint and suite loader.
  - Loads `packages/evals/suites/<suite>.jsonl`.
  - Sends prompts to `POST /v1/chat/completions`.
- `packages/evals/suites/*.jsonl`: the actual eval datasets (line-delimited JSON).
  - `integrity.jsonl`: prompt-injection + benign baseline.
  - `pii.jsonl`: synthetic PII prompts (safe for repos).

### `docs` — how to extend the project
- `docs/ARCHITECTURE.md`: components + data flow + roadmap.
- `docs/PROVIDERS/OLLAMA.md`: provider notes, expected endpoints.
- `docs/CONTROLS/PII.md`: how we think about PII controls and how to measure them.

## Controls and policy layers (how to extend)

### Pre-policy vs post-policy
Controls come in two natural stages:

- **Pre-policy (input controls)**: run before the model sees anything.
  - PII screening/redaction
  - prompt-injection detection
  - system prompt composition / hardening

- **Post-policy (output controls)**: run after the model responds.
  - detect PII leakage
  - enforce formatting/structure (e.g., JSON schema)
  - content guardrails ("must refuse X", "must cite Y", etc.)

This is why the gateway exists: it’s easier to reason about and test controls when there is one consistent choke point.

### Enforcement modes
The API gateway supports two enforcement modes:
- `POLICY_ENFORCEMENT=block` (default): violations return `403 blocked_by_policy`
- `POLICY_ENFORCEMENT=audit`: violations are allowed through but emitted in:
  - response header: `x-policy-violations`
  - API logs (for later metrics and analysis)

Use `audit` when you want to measure false positives/false negatives without breaking flows.

## Running evals to shape the system (the loop)

You can iterate in a tight loop:

1) Add/adjust a control in `apps/api/src/policy.ts`.
2) Add cases to a suite under `packages/evals/suites/`.
3) Run `packages/evals` against the gateway.
4) Track failures and improve the control or the prompts.

Later, you can extend this loop:
- store detailed run artifacts under `runs/` (gitignored)
- export “failures” to a training set for fine-tuning
- re-run suites to measure improvement

## Common commands
- Install: `pnpm install`
- Run gateway: `pnpm dev:api`
- Run integrity suite: `pnpm --filter evals run http://localhost:3000 llama3.1 integrity`
- Run PII suite: `pnpm --filter evals run http://localhost:3000 llama3.1 pii`

## Docs
- `docs/ARCHITECTURE.md`: components and data flow
- `docs/PROVIDERS/OLLAMA.md`: Ollama setup and API expectations
- `docs/CONTROLS/PII.md`: PII-focused control plan and eval approach
- `docs/ROADMAP.md`: phased milestones and checklists

## Notes
- The API gateway is the “control point”: it’s where input/output screening and audit logging live.
- Ollama simplifies local hosting; you can later swap in other providers by changing `UPSTREAM_BASE_URL`.
