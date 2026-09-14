import archiver from "archiver";
import { createReadStream, type ReadStream } from "node:fs";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { FastifyReply } from "fastify";
import { env } from "./config.ts";
import type { DoneJob, Playlist } from "./aurral.ts";

const FILE_RE = /[<>:"/\\|?*]/g;

export function sanitize(name: string): string {
  return name.replace(FILE_RE, "_").replace(/\s+/g, " ").trim();
}

function translate(finalPath: string): string | null {
  if (finalPath.startsWith(env.dsRoot)) {
    return join(env.srcRoot, finalPath.slice(env.dsRoot.length));
  }
  if (finalPath.startsWith(env.srcRoot)) return finalPath;
  return null;
}

export function exportDir(playlist: Playlist): string {
  return join(env.exportRoot, sanitize(playlist.name));
}

function safeJoin(root: string, p: string): string {
  const target = resolve(root, p);
  const rootResolved = resolve(root);
  if (!target.startsWith(rootResolved + "/") && target !== rootResolved) {
    throw new Error("path traversal blocked");
  }
  return target;
}

interface ExportedFile {
  name: string;
  size: number;
}

export function listExports(playlist: Playlist): { dir: string; files: ExportedFile[]; size: number; count: number } {
  const dir = exportDir(playlist);
  if (!existsSync(dir)) return { dir, files: [], size: 0, count: 0 };
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(".") === false)
    .sort()
    .map((f) => {
      const size = statSync(join(dir, f)).size;
      return { name: f, size };
    });
  return { dir, files, size: files.reduce((a, f) => a + f.size, 0), count: files.length };
}

export function runExport(playlist: Playlist, jobs: DoneJob[]): {
  dir: string;
  files: number;
  size: number;
  copied: number;
  taken: number;
  missing: string[];
} {
  const dir = exportDir(playlist);
  mkdirSync(dir, { recursive: true });

  let copied = 0;
  const missing: string[] = [];

  for (let idx = 0; idx < jobs.length; idx++) {
    const job = jobs[idx];
    const src = translate(job.finalPath);
    if (!src || !existsSync(src)) {
      missing.push(job.finalPath);
      continue;
    }
    const ext = extname(src).toLowerCase() || ".mp3";
    const name = `${String(idx + 1).padStart(2, "0")} - ${sanitize(job.artistName)} - ${sanitize(job.trackName)}${ext}`;
    const out = safeJoin(dir, name);
    if (existsSync(out) && statSync(out).size === statSync(src).size) {
      continue;
    }
    copyFileSync(src, out);
    copied++;
  }

  const { files, size, count } = listExports(playlist);
  void files;
  return { dir, files: count, size, copied, taken: jobs.length, missing };
}

export function streamZip(playlist: Playlist, reply: FastifyReply): void {
  const dir = exportDir(playlist);
  const { files } = listExports(playlist);
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("warning", (err) => reply.log.warn({ err }, "zip warning"));
  archive.on("error", (err) => {
    reply.log.error({ err }, "zip error");
    void reply.send(err);
  });

  reply.header("Content-Type", "application/zip");
  reply.header(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(sanitize(playlist.name))}.zip"`,
  );
  reply.hijack();
  archive.pipe(reply.raw);

  for (const f of files) {
    archive.append(createReadStream(safeJoin(dir, f.name)), { name: f.name });
  }
  void archive.finalize();
}

export function streamFile(playlist: Playlist, name: string, reply: FastifyReply): ReadStream | false {
  const path = safeJoin(exportDir(playlist), basename(name));
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  reply.header("Content-Type", "application/octet-stream");
  reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(basename(name))}"`);
  reply.header("Content-Length", String(size));
  return createReadStream(path);
}