import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  // Ollama's default local address. It also exposes OpenAI-compatible routes under `/v1/...`.
  UPSTREAM_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  UPSTREAM_API_KEY: z.string().optional(),
  // Controls how policy decisions are enforced:
  // - "block": return 403 for violations
  // - "audit": allow requests through but emit audit details
  POLICY_ENFORCEMENT: z.enum(["block", "audit"]).default("block"),
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default("llm_evals"),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  OLLAMA_CATALOG_URL: z.string().default("https://ollama.com/api/tags"),
  DB_SSL: z
    .union([z.literal("true"), z.literal("false")])
    .transform((value) => value === "true")
    .default("false")
});

const parsed = EnvSchema.parse(process.env);

export const env = {
  port: parsed.PORT,
  upstreamBaseUrl: parsed.UPSTREAM_BASE_URL,
  upstreamApiKey: parsed.UPSTREAM_API_KEY,
  policyEnforcement: parsed.POLICY_ENFORCEMENT,
  db: {
    host: parsed.DB_HOST,
    port: parsed.DB_PORT,
    name: parsed.DB_NAME,
    user: parsed.DB_USER,
    password: parsed.DB_PASSWORD,
    ssl: parsed.DB_SSL
  },
  ollamaCatalogUrl: parsed.OLLAMA_CATALOG_URL
};
