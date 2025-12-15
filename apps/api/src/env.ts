import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  UPSTREAM_BASE_URL: z.string().default("http://localhost:8000"),
  UPSTREAM_API_KEY: z.string().optional()
});

const parsed = EnvSchema.parse(process.env);

export const env = {
  port: parsed.PORT,
  upstreamBaseUrl: parsed.UPSTREAM_BASE_URL,
  upstreamApiKey: parsed.UPSTREAM_API_KEY
};
