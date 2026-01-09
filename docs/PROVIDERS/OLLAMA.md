# Ollama provider

Ollama is the default local provider for this repo.

## Why Ollama
- Simple local installation and model management
- Stable localhost API (`http://127.0.0.1:11434`)
- Works well for iterative evaluation and policy development

## Expected upstream API shape
`apps/api` forwards requests to:
- `POST {UPSTREAM_BASE_URL}/v1/chat/completions`

Many Ollama versions expose OpenAI-compatible endpoints under `/v1/...`.
If your Ollama setup does not, you can either:
- configure the gateway to target Ollama's native endpoints (future work), or
- run a local OpenAI-compat shim.

## Setup checklist
1) Install and start Ollama.
2) Pull a model:
   - `ollama pull <model>`
3) Set the API gateway upstream:
   - `UPSTREAM_BASE_URL=http://127.0.0.1:11434`
4) Run gateway:
   - `pnpm dev:api`

## Model naming
The eval runner sends a `model` field. For Ollama, this typically matches the local model name:
- `llama3.1`
- `mistral`
- etc.

