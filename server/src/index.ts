import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { env } from "./config.ts";
import { registerRoutes } from "./routes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../web/dist"),
  resolve(here, "../../web/dist"),
  resolve(process.cwd(), "web/dist"),
];
const webDir = candidates.find((dir) => existsSync(join(dir, "index.html")));

const app = Fastify({ logger: true, trustProxy: true });

await registerRoutes(app);

if (webDir) {
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