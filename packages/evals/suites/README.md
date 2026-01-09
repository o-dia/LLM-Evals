# Eval suites

Suites live next to the eval runner so they can version together.

## Format (initial)
Use JSONL (`.jsonl`) where each line is a test case.

Recommended fields:
- `id` (string)
- `name` (string)
- `prompt` (string)
- `tags` (string array)
- `expect` (object; suite-specific)

## Suites
- `integrity.jsonl`: prompt-injection + benign baseline
- `pii.jsonl`: synthetic PII prompts for screening/leakage tests
