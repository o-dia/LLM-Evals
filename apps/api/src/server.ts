import Fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import { z } from "zod";
import { env } from "./env.js";
import { evaluateOutputText, evaluatePrompt } from "./policy.js";
import { registerCrudRoutes } from "./routes.js";

const ChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string()
    })
  ),
  max_tokens: z.number().optional(),
  temperature: z.number().optional()
});

export const buildServer = async () => {
  const fastify = Fastify({ logger: true });

  await fastify.register(metricsPlugin, {
    endpoint: "/metrics",
    defaultMetrics: { enabled: true }
  });

  registerCrudRoutes(fastify);

  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  fastify.post("/v1/chat/completions", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", details: parsed.error.format() };
    }

    const decision = evaluatePrompt(parsed.data.messages);
    const enforcement = env.policyEnforcement;
    if (decision.action === "block" && enforcement === "block") {
      reply.code(403);
      return {
        error: "blocked_by_policy",
        category: decision.violations[0]?.category ?? "unknown",
        reason: decision.violations[0]?.reason ?? "Blocked by policy",
        violations: decision.violations
      };
    }
    if (decision.violations.length > 0) {
      reply.header("x-policy-enforcement", enforcement);
      reply.header("x-policy-violations", JSON.stringify(decision.violations));
      request.log.info({ violations: decision.violations }, "policy violations detected (audit)");
    }

    const upstreamUrl = new URL("/v1/chat/completions", env.upstreamBaseUrl).toString();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.upstreamApiKey) {
      headers["Authorization"] = `Bearer ${env.upstreamApiKey}`;
    }

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(parsed.data)
      });

      if (!upstreamResponse.ok) {
        const text = await upstreamResponse.text();
        reply.code(502);
        return { error: "upstream_error", details: text };
      }

      const json = await upstreamResponse.json();

      // Post-check: detect PII leakage in the assistant output.
      // This keeps the gateway as the single "control point" regardless of provider.
      const outputText =
        json?.choices?.map((c: any) => c?.message?.content ?? c?.text ?? "").join("\n\n") ??
        json?.message?.content ??
        "";
      if (typeof outputText === "string" && outputText.length > 0) {
        const outputDecision = evaluateOutputText(outputText);
        if (outputDecision.action === "block" && enforcement === "block") {
          reply.code(403);
          return {
            error: "blocked_by_policy",
            category: outputDecision.violations[0]?.category ?? "unknown",
            reason: outputDecision.violations[0]?.reason ?? "Blocked by output policy",
            violations: outputDecision.violations
          };
        }
        if (outputDecision.violations.length > 0) {
          reply.header("x-policy-enforcement", enforcement);
          reply.header("x-policy-violations", JSON.stringify(outputDecision.violations));
          request.log.info({ violations: outputDecision.violations }, "policy violations detected in output (audit)");
        }
      }

      return json;
    } catch (err) {
      request.log.error({ err }, "failed to call upstream");
      reply.code(500);
      return { error: "upstream_unreachable" };
    }
  });

  return fastify;
};
