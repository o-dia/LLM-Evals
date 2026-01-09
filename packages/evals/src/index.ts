#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

const argsSchema = z.object({
  baseUrl: z.string().default("http://localhost:3000"),
  model: z.string().default("llama3.1"),
  suite: z.string().default("integrity")
});

const parseArgs = () => {
  const baseUrlArg = process.env.API_BASE_URL || process.argv[2];
  const modelArg = process.env.MODEL || process.argv[3];
  const suiteArg = process.env.SUITE || process.argv[4];
  const parsed = argsSchema.parse({
    baseUrl: baseUrlArg ?? undefined,
    model: modelArg ?? undefined,
    suite: suiteArg ?? undefined
  });
  return parsed;
};

const SuiteCaseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  prompt: z.string(),
  tags: z.array(z.string()).optional(),
  expect: z
    .object({
      blocked: z.boolean().optional()
    })
    .optional()
});

type SuiteCase = z.infer<typeof SuiteCaseSchema>;

const loadSuiteCases = async (suiteName: string): Promise<SuiteCase[]> => {
  const packageDir = path.dirname(fileURLToPath(import.meta.url));
  const suitePath = path.resolve(packageDir, "..", "suites", `${suiteName}.jsonl`);
  const raw = await readFile(suitePath, "utf8");

  const cases: SuiteCase[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON in suite ${suiteName}.jsonl at line ${index + 1}: ${message}`);
    }

    cases.push(SuiteCaseSchema.parse(parsedJson));
  }

  if (cases.length === 0) {
    throw new Error(`Suite ${suiteName}.jsonl contains no cases`);
  }

  return cases;
};

const runScenario = async (
  baseUrl: string,
  model: string,
  scenario: SuiteCase
): Promise<{ id: string; name: string; passed: boolean; reason?: string }> => {
  const body = {
    model,
    messages: [{ role: "user", content: scenario.prompt }]
  };

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await resp.json().catch(() => ({}));

  const expectBlocked = scenario.expect?.blocked === true;
  const name = scenario.name ?? scenario.id;

  if (expectBlocked) {
    const blocked = resp.status === 403 && json.error === "blocked_by_policy";
    return {
      id: scenario.id,
      name,
      passed: blocked,
      reason: blocked ? undefined : `Expected block, got ${resp.status}`
    };
  }

  const allowed = resp.ok && !json.error;
  return {
    id: scenario.id,
    name,
    passed: allowed,
    reason: allowed ? undefined : `Expected allow, got ${resp.status}`
  };
};

const main = async () => {
  const { baseUrl, model, suite } = parseArgs();
  const cases = await loadSuiteCases(suite);

  console.log(`Running suite=${suite} against ${baseUrl} (model=${model})`);

  const results = await Promise.all(cases.map((testCase) => runScenario(baseUrl, model, testCase)));

  let failures = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(`✅ ${result.name}`);
    } else {
      failures += 1;
      console.log(`❌ ${result.name} :: ${result.reason ?? "failed"}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} scenario(s) failed`);
    process.exit(1);
  } else {
    console.log("\nAll scenarios passed");
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
