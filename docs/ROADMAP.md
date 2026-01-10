# Roadmap

This doc captures the phased plan for evolving the repo from a policy adapter + eval runner into a UI-driven system with persistence and, later, local fine-tuning.

## Phase 0: Alignment and documentation
- [x] Align on stack: React + Vite + TypeScript UI, Fastify API, Postgres
- [x] Document architecture and DB env config

## Phase 1: Foundations (policy adapter + storage + UI shell)
- [x] Add `apps/web` scaffold
- [x] Choose a DB access/migration approach
- [x] Define core schema: policies, suites, cases, runs, run_results
- [x] Add API CRUD endpoints for policies, suites, cases
- [x] Build UI shell (model selector, policies list, suites list)
- [x] Add seed script for sample data
- [x] Add Ollama model listing + pull workflow

## Phase 2: Policy to test case workflow
- [ ] Upload policy documents
- [ ] Use the selected model to draft test cases
- [ ] UI editor for reviewing and editing cases
- [ ] Save approved cases to Postgres
- [x] Import built-in suites from JSONL into Postgres
- [x] Curated built-in suites list in the UI

## Phase 3: Eval execution and results
- [x] Run cases through the gateway from the API
- [x] Store run results (violations, status, traces)
- [x] UI results table with filters and comparisons
- [x] Dedicated results page with run progress + timestamps
- [ ] Export runs to JSONL for CLI parity

## Phase 4: Data curation for fine-tuning
- [ ] Label and approve training examples
- [ ] Add dataset versioning and exports
- [ ] Track evaluation metrics per dataset

## Phase 5: LoRA/QLoRA (future)
- [ ] Select local training tooling
- [ ] Train smaller model variants locally
- [ ] Register adapters and re-run evals

## Testing plan (detailed)
- [x] Add a `buildServer()` helper to support integration tests without listening on a port
- [x] Add a Vitest configuration and test setup (loads env, points to test DB, runs migrations)
- [x] Unit tests for `apps/api/src/policy.ts` (PII + heuristics)
- [x] Integration tests for CRUD endpoints (policies/suites/cases)
- [x] Integration tests for run execution + stored results
- [x] Add `test` scripts at the root and `apps/api`
- [x] Run `npm test` and capture any failures
