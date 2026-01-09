import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool, runMigrations } from "../src/db.js";
import { buildServer } from "../src/server.js";

const truncateAll = async () => {
  await pool.query(
    "TRUNCATE TABLE run_results, runs, cases, suites, policies, models RESTART IDENTITY CASCADE"
  );
};

describe("API routes", () => {
  let server: FastifyInstance | null = null;

  beforeAll(async () => {
    await runMigrations();
    server = await buildServer();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await pool.end();
  });

  it("creates and lists policies", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/policies",
      payload: {
        title: "PII rules",
        content: "Block emails and phone numbers."
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.payload);
    expect(created.title).toBe("PII rules");

    const listResponse = await server.inject({ method: "GET", url: "/policies" });
    expect(listResponse.statusCode).toBe(200);
    const listPayload = JSON.parse(listResponse.payload);
    expect(listPayload.data).toHaveLength(1);
  });

  it("creates suites linked to policies", async () => {
    const policyResponse = await server.inject({
      method: "POST",
      url: "/policies",
      payload: { title: "Safety", content: "No PII." }
    });
    const policy = JSON.parse(policyResponse.payload);

    const suiteResponse = await server.inject({
      method: "POST",
      url: "/suites",
      payload: { name: "Safety suite", policy_id: policy.id }
    });
    expect(suiteResponse.statusCode).toBe(201);

    const listResponse = await server.inject({
      method: "GET",
      url: `/suites?policy_id=${policy.id}`
    });
    const listPayload = JSON.parse(listResponse.payload);
    expect(listPayload.data).toHaveLength(1);
  });

  it("creates and lists cases", async () => {
    const suiteResponse = await server.inject({
      method: "POST",
      url: "/suites",
      payload: { name: "Integrity checks" }
    });
    const suite = JSON.parse(suiteResponse.payload);

    const caseResponse = await server.inject({
      method: "POST",
      url: "/cases",
      payload: {
        suite_id: suite.id,
        prompt: "Say hello.",
        expected_outcome: "allow",
        tags: ["baseline"]
      }
    });
    expect(caseResponse.statusCode).toBe(201);

    const listResponse = await server.inject({
      method: "GET",
      url: `/cases?suite_id=${suite.id}`
    });
    const listPayload = JSON.parse(listResponse.payload);
    expect(listPayload.data).toHaveLength(1);
  });

  it("executes a run and stores results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Allowed response." } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    globalThis.fetch = fetchMock;

    const suiteResponse = await server.inject({
      method: "POST",
      url: "/suites",
      payload: { name: "Run suite" }
    });
    const suite = JSON.parse(suiteResponse.payload);

    await server.inject({
      method: "POST",
      url: "/cases",
      payload: {
        suite_id: suite.id,
        prompt: "Email me at jane@example.com",
        expected_outcome: "block"
      }
    });

    await server.inject({
      method: "POST",
      url: "/cases",
      payload: {
        suite_id: suite.id,
        prompt: "List three planets.",
        expected_outcome: "allow"
      }
    });

    const runResponse = await server.inject({
      method: "POST",
      url: "/runs",
      payload: { suite_id: suite.id, model_name: "gpt-oss-20b" }
    });
    expect(runResponse.statusCode).toBe(200);
    const runPayload = JSON.parse(runResponse.payload);
    expect(runPayload.status).toBe("completed");
    expect(runPayload.totals.passed).toBe(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const resultsResponse = await server.inject({
      method: "GET",
      url: `/runs/${runPayload.id}/results`
    });
    const resultsPayload = JSON.parse(resultsResponse.payload);
    expect(resultsPayload.data).toHaveLength(2);
    expect(resultsPayload.data.every((row: { passed: boolean }) => row.passed)).toBe(true);
  });
});
