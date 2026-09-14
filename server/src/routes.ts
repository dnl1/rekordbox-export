import type { FastifyInstance } from "fastify";
import { aurral, type Playlist } from "./aurral.ts";
import { exportDir, listExports, runExport, streamFile, streamZip } from "./export.ts";

function findPlaylist(id: string): Playlist {
  const p = aurral.playlists().find((x) => x.id === id);
  if (!p) throw Object.assign(new Error(`playlist not found: ${id}`), { statusCode: 404 });
  return p;
}

function summary(p: Playlist) {
  const stats = aurral.jobStats(p.id);
  const exp = listExports(p);
  return { ...p, stats, export: { files: exp.count, size: exp.size, dir: exp.dir } };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true, time: Date.now() }));

  app.get("/api/playlists", async () => ({
    playlists: aurral.playlists().map(summary),
  }));

  app.get("/api/playlists/:id/export", async (req) => {
    const { id } = req.params as { id: string };
    return { playlist: summary(findPlaylist(id)) };
  });

  app.post("/api/playlists/:id/export", async (req) => {
    const { id } = req.params as { id: string };
    const playlist = findPlaylist(id);
    const jobs = aurral.doneJobs(id);
    const result = runExport(playlist, jobs);
    return { playlist: summary(playlist), export: result };
  });

  app.get("/api/playlists/:id/files", async (req) => {
    const { id } = req.params as { id: string };
    const playlist = findPlaylist(id);
    return { dir: exportDir(playlist), files: listExports(playlist).files };
  });

  app.get("/api/playlists/:id/file", async (req, reply) => {
    const { id } = req.params as { id: string };
    const name = (req.query as Record<string, string>).name ?? "";
    const playlist = findPlaylist(id);
    const stream = streamFile(playlist, name, reply);
    if (!stream) {
      void reply.code(404).send({ error: "file not found" });
      return;
    }
    return reply.send(stream);
  });

  app.get("/api/playlists/:id/zip", async (req, reply) => {
    const { id } = req.params as { id: string };
    streamZip(findPlaylist(id), reply);
  });
}