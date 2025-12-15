import Fastify from "fastify";
import metricsPlugin from "fastify-metrics";
import { z } from "zod";
import { env } from "./env.js";
import { evaluatePrompt } from "./policy.js";

const fastify = Fastify({ logger: true });

await fastify.register(metricsPlugin, {
  endpoint: "/metrics",
  defaultMetrics: { enabled: true }
});

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
  if (!decision.allowed) {
    reply.code(403);
    return {
      error: "blocked_by_policy",
      category: decision.category,
      reason: decision.reason
    };
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
    return json;
  } catch (err) {
    request.log.error({ err }, "failed to call upstream");
    reply.code(500);
    return { error: "upstream_unreachable" };
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: env.port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
