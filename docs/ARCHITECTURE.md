# Architecture

This repo is organized around a simple idea:

> Put a policy/control layer in front of a model provider, then run eval suites against that policy layer.

We are extending that core loop with a UI and persistence so users can turn policies into test cases and track outcomes over time.

## Components

### `apps/api` (policy gateway + core API)
An HTTP API that exposes an OpenAI-compatible route:

- `POST /v1/chat/completions`

The gateway:
- validates request shape
- applies policy controls (block/redact/audit)
- forwards the request upstream (default: Ollama)
- returns the upstream response (or a policy error)

Planned additions:
- policy document ingestion (store, summarize, and generate draft test cases)
- CRUD for suites, cases, and runs
- run orchestration and results persistence

### `apps/web` (embedded UI, planned)
A React + Vite + TypeScript app embedded in the monorepo. It will:
- select an upstream model (Ollama)
- upload policy documents
- review and edit generated test cases
- run evals and browse results

### `packages/evals` (eval runner CLI)
Runs eval suites against the gateway and produces pass/fail output.

Over time, this should grow into:
- suite discovery + tagging
- scoring and metrics aggregation
- run artifacts under `runs/` (ignored by git)

### Postgres (planned)
Persistent storage for policies, suites, cases, and eval runs.
Migrations live in `apps/api/migrations` and are applied on API startup.

### Provider (Ollama-first)
The gateway forwards to an upstream that speaks OpenAI-style `/v1/chat/completions`.

By default we target:
- `http://127.0.0.1:11434` (Ollama)

## Data flow (interactive UI)
1) User selects an Ollama model.
2) User uploads a policy document.
3) `apps/api` uses the selected model to draft test cases from that policy.
4) User edits and approves test cases in the UI.
5) Test cases are saved in Postgres.
6) User runs evals; `apps/api` routes cases through the gateway.
7) Results are stored and visualized in the UI.
8) Later, curated cases can be exported as a training dataset.

## Data model (sketch)
- `models`: provider name + model id + metadata
- `policies`: title + raw content + derived summaries
- `suites`: grouping for related test cases
- `cases`: prompt + expected outcome + tags
- `runs`: execution metadata (model, suite, timestamps)
- `run_results`: per-case outcome + violations + traces

## Policy adapter now, fine-tuning later
- Phase 1 uses a policy adapter: system prompt shaping plus pre/post controls in the gateway.
- Future phases can export datasets for LoRA/QLoRA.
- For local training on a MacBook Air, expect to target smaller models (3B to 8B) even if evals run against larger models.

## Roadmap
See `docs/ROADMAP.md` for phased milestones and checklists.
