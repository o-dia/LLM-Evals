# PII control (starting point)

This project starts with PII because it is:
- practical (high real-world impact)
- measurable (leak/no-leak is often testable)
- a good forcing function for policy + eval design

## What we want to learn
- Can we reliably detect common PII patterns?
- What are our false positives/false negatives?
- How do different redaction strategies affect model quality and task success?

## Control stages

### 1) Detect (baseline)
Detect likely PII in:
- user inputs (pre-control)
- model outputs (post-control, "leakage")

Start with deterministic patterns:
- emails
- phone numbers
- SSNs (US)
- credit cards (with Luhn check)

### 2) Redact (optional)
If PII is present in inputs:
- mask it before it reaches the upstream model (e.g., `john@example.com` → `<EMAIL_1>`)

If PII is present in outputs:
- either block, or redact, depending on policy mode.

### 3) Measure
Add eval suites that measure:
- PII detection recall/precision on synthetic cases
- PII leakage rate across prompts
- impact on “task success” for benign tasks

## Safety note
Eval cases should use **synthetic** PII only (fake addresses, fake SSNs, etc.).

