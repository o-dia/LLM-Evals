# LLM Evals

Reference scaffold for running an open-source LLM with a policy guard, integrity evals, and monitoring.

## Layout
- `apps/api`: Fastify API proxying to an OpenAI-compatible runtime (e.g., vLLM) with policy checks.
- `packages/evals`: CLI to run policy integrity evals against the API.
- `infra/monitoring`: Prometheus + Grafana stack for metrics and dashboards.

## Prereqs
- Node 20+
- pnpm 8+
- An OpenAI-compatible endpoint (vLLM recommended) reachable at `UPSTREAM_BASE_URL`.

## API
1) Copy `apps/api/.env.example` to `apps/api/.env` and set `UPSTREAM_BASE_URL` (and `UPSTREAM_API_KEY` if needed).
2) Install deps: `pnpm install` (from repo root).
3) Run dev server: `pnpm dev:api` (listens on `PORT`, default 3000).
4) Endpoints:
   - `GET /health`
   - `GET /metrics`
   - `POST /v1/chat/completions` (forwarded upstream after policy checks)

## Evals
- Build: `pnpm --filter evals build`
- Run: `pnpm --filter evals run [API_BASE_URL] [MODEL]`
- Scenarios include prompt-injection, disallowed content, malware, and a benign baseline. Exit code is non-zero on failures.

## Monitoring
- From `infra/monitoring`: `docker compose up`
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (Prometheus pre-wired; dashboard auto-provisioned)

## Notes
- Policy is rules + heuristics; extend `apps/api/src/policy.ts` with richer classifiers.
- Upstream runtime: vLLM is recommended for OpenAI-compatible serving and throughput; llama.cpp is an alternative for CPU/edge with lower perf and non-OpenAI API.
