import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { env } from "./config.ts";
import { registerRoutes } from "./routes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../../web/dist");

const app = Fastify({ logger: true, trustProxy: true });

await registerRoutes(app);

if (existsSync(join(webDir, "index.html"))) {
  await app.register(fastifyStatic, {
    root: webDir,
    prefix: "/",
    index: "index.html",
    wildcard: false,
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && req.headers.accept?.includes("text/html")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });
}

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}