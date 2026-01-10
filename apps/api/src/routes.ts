import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { pool } from "./db.js";
import { env } from "./env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const builtinSuitesDir = path.resolve(__dirname, "../../../packages/evals/suites");

const builtinSuites = [
  {
    id: "pii",
    name: "PII screening",
    description: "Synthetic PII prompts for screening and leakage tests.",
    filename: "pii.jsonl"
  },
  {
    id: "integrity",
    name: "Integrity checks",
    description: "Prompt-injection and benign baseline cases.",
    filename: "integrity.jsonl"
  }
] as const;

const idParamSchema = z.object({
  id: z.string().uuid()
});

const listQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0)
});

const policyCreateSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().optional()
});

const policyUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    summary: z.string().optional()
  })
  .refine((data) => data.title !== undefined || data.content !== undefined || data.summary !== undefined, {
    message: "At least one field is required"
  });

const suiteCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  policy_id: z.string().uuid().optional()
});

const suiteUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    policy_id: z.string().uuid().optional()
  })
  .refine((data) => data.name !== undefined || data.description !== undefined || data.policy_id !== undefined, {
    message: "At least one field is required"
  });

const caseCreateSchema = z.object({
  suite_id: z.string().uuid(),
  prompt: z.string().min(1),
  expected_outcome: z.string().min(1),
  expected_notes: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const caseUpdateSchema = z
  .object({
    prompt: z.string().min(1).optional(),
    expected_outcome: z.string().min(1).optional(),
    expected_notes: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
  .refine(
    (data) =>
      data.prompt !== undefined ||
      data.expected_outcome !== undefined ||
      data.expected_notes !== undefined ||
      data.tags !== undefined,
    { message: "At least one field is required" }
  );

const runCreateSchema = z.object({
  suite_id: z.string().uuid(),
  model_name: z.string().min(1),
  provider: z.string().min(1).default("ollama")
});

const ollamaPullSchema = z.object({
  model: z.string().min(1)
});

const builtinImportSchema = z.object({
  suite: z.enum(["pii", "integrity"]),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  policy_id: z.string().uuid().optional()
});

const suitesListQuerySchema = listQuerySchema.extend({
  policy_id: z.string().uuid().optional()
});

const casesListQuerySchema = listQuerySchema.extend({
  suite_id: z.string().uuid().optional()
});

const runsListQuerySchema = listQuerySchema.extend({
  suite_id: z.string().uuid().optional(),
  model_id: z.string().uuid().optional()
});

const formatValidationError = (error: z.ZodError) => ({
  error: "invalid_request",
  details: error.format()
});

const safeJsonParse = (payload: string) => {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const extractOutputText = (payload: any): string => {
  return (
    payload?.choices?.map((choice: any) => choice?.message?.content ?? choice?.text ?? "").join("\n\n") ??
    payload?.message?.content ??
    ""
  );
};

const parseViolations = (payload: any, headers: Record<string, unknown>): unknown => {
  const headerValue = headers["x-policy-violations"];
  const headerText = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof headerText === "string" && headerText.length > 0) {
    return safeJsonParse(headerText) ?? headerText;
  }
  if (payload?.violations) {
    return payload.violations;
  }
  return null;
};

const truncateText = (value: string, limit = 500) => {
  if (value.length <= limit) return value;
  return value.slice(0, limit);
};

const buildOllamaUrl = (path: string) => new URL(path, env.upstreamBaseUrl).toString();

const parseOllamaStream = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = lines.map(safeJsonParse).filter((value) => value !== null);
  const last = parsed.length > 0 ? parsed[parsed.length - 1] : null;
  return { last, updates: parsed.slice(-5) };
};

const loadBuiltinSuiteCases = async (filename: string) => {
  const filePath = path.join(builtinSuitesDir, filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const cases: Array<{
    id?: string;
    name?: string;
    prompt: string;
    tags?: string[];
    expect?: { blocked?: boolean };
  }> = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = safeJsonParse(trimmed);
    if (!parsed) continue;
    if (typeof parsed.prompt !== "string") continue;
    cases.push(parsed);
  }

  return cases;
};

export const registerCrudRoutes = (fastify: FastifyInstance) => {
  fastify.get("/providers/ollama/health", async (_request, reply) => {
    try {
      const response = await fetch(buildOllamaUrl("/api/tags"));
      if (!response.ok) {
        reply.code(502);
        return { ok: false, error: `Ollama responded with ${response.status}` };
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ollama unreachable";
      reply.code(503);
      return { ok: false, error: message };
    }
  });

  fastify.get("/providers/ollama/models", async (_request, reply) => {
    try {
      const response = await fetch(buildOllamaUrl("/api/tags"));
      if (!response.ok) {
        reply.code(502);
        return { error: "ollama_error", details: await response.text() };
      }
      const payload = await response.json();
      return { models: payload?.models ?? [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ollama unreachable";
      reply.code(503);
      return { error: "ollama_unreachable", details: message };
    }
  });

  fastify.post("/providers/ollama/pull", async (request, reply) => {
    const parsed = ollamaPullSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    try {
      const response = await fetch(buildOllamaUrl("/api/pull"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.data.model })
      });

      if (!response.ok) {
        reply.code(502);
        return { error: "ollama_error", details: await response.text() };
      }

      const text = await response.text();
      const { last, updates } = parseOllamaStream(text);
      return {
        status: last?.status ?? "unknown",
        details: last,
        updates
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ollama unreachable";
      reply.code(503);
      return { error: "ollama_unreachable", details: message };
    }
  });

  fastify.get("/providers/ollama/catalog", async (_request, reply) => {
    try {
      const response = await fetch(env.ollamaCatalogUrl);
      if (!response.ok) {
        reply.code(502);
        return { error: "ollama_catalog_error", details: await response.text() };
      }
      const payload = await response.json();
      return { models: payload?.models ?? [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Catalog unreachable";
      reply.code(503);
      return { error: "ollama_catalog_unreachable", details: message };
    }
  });

  fastify.get("/suites/builtin", async () => {
    return { suites: builtinSuites };
  });

  fastify.post("/suites/builtin/import", async (request, reply) => {
    const parsed = builtinImportSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const suiteMeta = builtinSuites.find((suite) => suite.id === parsed.data.suite);
    if (!suiteMeta) {
      reply.code(404);
      return { error: "builtin_suite_not_found" };
    }

    const cases = await loadBuiltinSuiteCases(suiteMeta.filename);
    if (cases.length === 0) {
      reply.code(400);
      return { error: "builtin_suite_empty" };
    }

    await pool.query("BEGIN");
    try {
      const suiteName = parsed.data.name ?? suiteMeta.name;
      const suiteDescription = parsed.data.description ?? suiteMeta.description;
      const suiteResult = await pool.query(
        "INSERT INTO suites (name, description, policy_id) VALUES ($1, $2, $3) RETURNING id",
        [suiteName, suiteDescription, parsed.data.policy_id ?? null]
      );
      const suiteId = suiteResult.rows[0].id as string;

      for (const testCase of cases) {
        const expectedOutcome = testCase.expect?.blocked ? "block" : "allow";
        const expectedNotes = testCase.name ?? testCase.id ?? null;
        const tags = JSON.stringify(testCase.tags ?? []);

        await pool.query(
          "INSERT INTO cases (suite_id, prompt, expected_outcome, expected_notes, tags) VALUES ($1, $2, $3, $4, $5::jsonb)",
          [suiteId, testCase.prompt, expectedOutcome, expectedNotes, tags]
        );
      }

      await pool.query("COMMIT");
      reply.code(201);
      return { id: suiteId, name: suiteName, cases: cases.length };
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  });

  fastify.get("/policies", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { limit, offset } = parsed.data;
    const result = await pool.query(
      "SELECT * FROM policies ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return { data: result.rows };
  });

  fastify.get("/policies/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("SELECT * FROM policies WHERE id = $1", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return result.rows[0];
  });

  fastify.post("/policies", async (request, reply) => {
    const parsed = policyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { title, content, summary } = parsed.data;
    const result = await pool.query(
      "INSERT INTO policies (title, content, summary) VALUES ($1, $2, $3) RETURNING *",
      [title, content, summary ?? null]
    );
    reply.code(201);
    return result.rows[0];
  });

  fastify.patch("/policies/:id", async (request, reply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return formatValidationError(parsedParams.error);
    }

    const parsedBody = policyUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400);
      return formatValidationError(parsedBody.error);
    }

    const existing = await pool.query("SELECT * FROM policies WHERE id = $1", [parsedParams.data.id]);
    if (existing.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }

    const current = existing.rows[0];
    const nextTitle = parsedBody.data.title ?? current.title;
    const nextContent = parsedBody.data.content ?? current.content;
    const nextSummary = parsedBody.data.summary ?? current.summary;

    const result = await pool.query(
      "UPDATE policies SET title = $2, content = $3, summary = $4, updated_at = NOW() WHERE id = $1 RETURNING *",
      [parsedParams.data.id, nextTitle, nextContent, nextSummary]
    );
    return result.rows[0];
  });

  fastify.delete("/policies/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("DELETE FROM policies WHERE id = $1 RETURNING id", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { id: result.rows[0].id };
  });

  fastify.get("/suites", async (request, reply) => {
    const parsed = suitesListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { limit, offset, policy_id } = parsed.data;
    const result = policy_id
      ? await pool.query(
          "SELECT * FROM suites WHERE policy_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
          [policy_id, limit, offset]
        )
      : await pool.query("SELECT * FROM suites ORDER BY created_at DESC LIMIT $1 OFFSET $2", [
          limit,
          offset
        ]);
    return { data: result.rows };
  });

  fastify.get("/suites/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("SELECT * FROM suites WHERE id = $1", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return result.rows[0];
  });

  fastify.post("/suites", async (request, reply) => {
    const parsed = suiteCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { name, description, policy_id } = parsed.data;
    const result = await pool.query(
      "INSERT INTO suites (name, description, policy_id) VALUES ($1, $2, $3) RETURNING *",
      [name, description ?? null, policy_id ?? null]
    );
    reply.code(201);
    return result.rows[0];
  });

  fastify.patch("/suites/:id", async (request, reply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return formatValidationError(parsedParams.error);
    }

    const parsedBody = suiteUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400);
      return formatValidationError(parsedBody.error);
    }

    const existing = await pool.query("SELECT * FROM suites WHERE id = $1", [parsedParams.data.id]);
    if (existing.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }

    const current = existing.rows[0];
    const nextName = parsedBody.data.name ?? current.name;
    const nextDescription = parsedBody.data.description ?? current.description;
    const nextPolicyId = parsedBody.data.policy_id ?? current.policy_id;

    const result = await pool.query(
      "UPDATE suites SET name = $2, description = $3, policy_id = $4, updated_at = NOW() WHERE id = $1 RETURNING *",
      [parsedParams.data.id, nextName, nextDescription, nextPolicyId]
    );
    return result.rows[0];
  });

  fastify.delete("/suites/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("DELETE FROM suites WHERE id = $1 RETURNING id", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { id: result.rows[0].id };
  });

  fastify.get("/cases", async (request, reply) => {
    const parsed = casesListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { limit, offset, suite_id } = parsed.data;
    const result = suite_id
      ? await pool.query(
          "SELECT * FROM cases WHERE suite_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
          [suite_id, limit, offset]
        )
      : await pool.query("SELECT * FROM cases ORDER BY created_at DESC LIMIT $1 OFFSET $2", [
          limit,
          offset
        ]);
    return { data: result.rows };
  });

  fastify.get("/cases/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("SELECT * FROM cases WHERE id = $1", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return result.rows[0];
  });

  fastify.post("/cases", async (request, reply) => {
    const parsed = caseCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { suite_id, prompt, expected_outcome, expected_notes, tags } = parsed.data;
    const tagsJson = JSON.stringify(tags ?? []);
    const result = await pool.query(
      "INSERT INTO cases (suite_id, prompt, expected_outcome, expected_notes, tags) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *",
      [suite_id, prompt, expected_outcome, expected_notes ?? null, tagsJson]
    );
    reply.code(201);
    return result.rows[0];
  });

  fastify.patch("/cases/:id", async (request, reply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return formatValidationError(parsedParams.error);
    }

    const parsedBody = caseUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400);
      return formatValidationError(parsedBody.error);
    }

    const existing = await pool.query("SELECT * FROM cases WHERE id = $1", [parsedParams.data.id]);
    if (existing.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }

    const current = existing.rows[0];
    const nextPrompt = parsedBody.data.prompt ?? current.prompt;
    const nextExpectedOutcome = parsedBody.data.expected_outcome ?? current.expected_outcome;
    const nextExpectedNotes = parsedBody.data.expected_notes ?? current.expected_notes;
    const nextTags = parsedBody.data.tags ?? current.tags ?? [];
    const tagsJson = JSON.stringify(nextTags);

    const result = await pool.query(
      "UPDATE cases SET prompt = $2, expected_outcome = $3, expected_notes = $4, tags = $5::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *",
      [parsedParams.data.id, nextPrompt, nextExpectedOutcome, nextExpectedNotes, tagsJson]
    );
    return result.rows[0];
  });

  fastify.delete("/cases/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("DELETE FROM cases WHERE id = $1 RETURNING id", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { id: result.rows[0].id };
  });

  fastify.get("/runs", async (request, reply) => {
    const parsed = runsListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { limit, offset, suite_id, model_id } = parsed.data;

    let result;
    if (suite_id && model_id) {
      result = await pool.query(
        "SELECT * FROM runs WHERE suite_id = $1 AND model_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
        [suite_id, model_id, limit, offset]
      );
    } else if (suite_id) {
      result = await pool.query(
        "SELECT * FROM runs WHERE suite_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [suite_id, limit, offset]
      );
    } else if (model_id) {
      result = await pool.query(
        "SELECT * FROM runs WHERE model_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [model_id, limit, offset]
      );
    } else {
      result = await pool.query("SELECT * FROM runs ORDER BY created_at DESC LIMIT $1 OFFSET $2", [
        limit,
        offset
      ]);
    }

    return { data: result.rows };
  });

  fastify.get("/runs/:id", async (request, reply) => {
    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const result = await pool.query("SELECT * FROM runs WHERE id = $1", [parsed.data.id]);
    if (result.rowCount === 0) {
      reply.code(404);
      return { error: "not_found" };
    }
    return result.rows[0];
  });

  fastify.get("/runs/:id/results", async (request, reply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400);
      return formatValidationError(parsedParams.error);
    }

    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      reply.code(400);
      return formatValidationError(parsedQuery.error);
    }

    const { limit, offset } = parsedQuery.data;
    const result = await pool.query(
      `SELECT run_results.*, cases.prompt, cases.expected_outcome, cases.expected_notes
       FROM run_results
       JOIN cases ON cases.id = run_results.case_id
       WHERE run_results.run_id = $1
       ORDER BY run_results.created_at ASC
       LIMIT $2 OFFSET $3`,
      [parsedParams.data.id, limit, offset]
    );
    return { data: result.rows };
  });

  fastify.post("/runs", async (request, reply) => {
    const parsed = runCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return formatValidationError(parsed.error);
    }

    const { suite_id, model_name, provider } = parsed.data;

    const suiteResult = await pool.query("SELECT id FROM suites WHERE id = $1", [suite_id]);
    if (suiteResult.rowCount === 0) {
      reply.code(404);
      return { error: "suite_not_found" };
    }

    const modelLookup = await pool.query("SELECT id FROM models WHERE provider = $1 AND model_name = $2", [
      provider,
      model_name
    ]);
    const modelId =
      modelLookup.rowCount > 0
        ? modelLookup.rows[0].id
        : (
            await pool.query(
              "INSERT INTO models (provider, model_name) VALUES ($1, $2) RETURNING id",
              [provider, model_name]
            )
          ).rows[0].id;

    const caseResult = await pool.query(
      "SELECT id, prompt, expected_outcome FROM cases WHERE suite_id = $1 ORDER BY created_at ASC",
      [suite_id]
    );
    const totalCases = caseResult.rows.length;

    const runInsert = await pool.query(
      "INSERT INTO runs (suite_id, model_id, status, total_cases, completed_cases, passed_cases, failed_cases) VALUES ($1, $2, $3, $4, 0, 0, 0) RETURNING *",
      [suite_id, modelId, "running", totalCases]
    );
    const run = runInsert.rows[0];
    const runId = run.id as string;

    const executeRun = async () => {
      try {
        if (totalCases === 0) {
          await pool.query("UPDATE runs SET status = $2, completed_at = NOW() WHERE id = $1", [
            runId,
            "completed"
          ]);
          return;
        }

        for (const testCase of caseResult.rows) {
          const expected = String(testCase.expected_outcome ?? "").toLowerCase();
          const expectBlock = expected === "block";

          // Reuse the same policy pipeline the external API route uses.
          const response = await fastify.inject({
            method: "POST",
            url: "/v1/chat/completions",
            payload: {
              model: model_name,
              messages: [{ role: "user", content: testCase.prompt }]
            },
            headers: { "Content-Type": "application/json" }
          });

          const payload = safeJsonParse(response.payload);
          const blocked = response.statusCode === 403 && payload?.error === "blocked_by_policy";
          const allowed = response.statusCode >= 200 && response.statusCode < 300 && !payload?.error;
          const passed = expectBlock ? blocked : allowed;

          const violations = parseViolations(payload, response.headers);
          const outputText = payload ? extractOutputText(payload) : "";
          const responseExcerpt = outputText ? truncateText(outputText) : null;

          await pool.query(
            "INSERT INTO run_results (run_id, case_id, passed, violations, response_excerpt) VALUES ($1, $2, $3, $4::jsonb, $5)",
            [
              runId,
              testCase.id,
              passed,
              violations ? JSON.stringify(violations) : null,
              responseExcerpt
            ]
          );

          await pool.query(
            "UPDATE runs SET completed_cases = completed_cases + 1, passed_cases = passed_cases + $2, failed_cases = failed_cases + $3 WHERE id = $1",
            [runId, passed ? 1 : 0, passed ? 0 : 1]
          );
        }

        await pool.query("UPDATE runs SET status = $2, completed_at = NOW() WHERE id = $1", [
          runId,
          "completed"
        ]);
      } catch (error) {
        await pool.query("UPDATE runs SET status = $2, completed_at = NOW() WHERE id = $1", [
          runId,
          "failed"
        ]);
        fastify.log.error({ error, runId }, "run execution failed");
      }
    };

    setImmediate(() => {
      void executeRun();
    });

    reply.code(202);
    return run;
  });
};
