import { runMigrations } from "./db.js";
import { env } from "./env.js";
import { buildServer } from "./server.js";

const start = async () => {
  try {
    await runMigrations();
    const fastify = await buildServer();
    await fastify.listen({ port: env.port, host: "0.0.0.0" });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
