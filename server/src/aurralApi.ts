import { env } from "./config.ts";
import { aurral, type FailedJob, type Playlist } from "./aurral.ts";

interface ApiError {
  error?: string;
  message?: string;
}

function authHeaders(): Record<string, string> {
  const token = aurral.sessionToken();
  if (!token) {
    throw Object.assign(new Error("no valid Aurral session token found"), { statusCode: 503 });
  }
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request<T>(method: string, path: string): Promise<T> {
  const res = await fetch(env.aurralApi + path, { method, headers: authHeaders() });
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  if (!res.ok) {
    const err = body as ApiError;
    throw new Error(`Aurral ${res.status}: ${err.message ?? err.error ?? res.statusText}`);
  }
  return body as T;
}

export interface RetryJobResult {
  id: string;
  ok: boolean;
  detail?: string;
}

export interface RetryPlaylistResult {
  requeued: number;
  jobs: RetryJobResult[];
}

export async function retryJob(playlist: Playlist, job: FailedJob): Promise<boolean> {
  const kind = playlist.kind === "flow" ? "flows" : "shared-playlists";
  await request<{ success?: boolean }>(
    "POST",
    `/api/playlists/${kind}/${encodeURIComponent(playlist.id)}/tracks/${encodeURIComponent(job.id)}/research`,
  );
  return true;
}

export async function retryPlaylist(playlist: Playlist): Promise<RetryPlaylistResult> {
  if (playlist.kind === "shared") {
    const body = await request<{ requeued?: number }>(
      "POST",
      `/api/playlists/shared-playlists/${encodeURIComponent(playlist.id)}/research-missing`,
    );
    return { requeued: body.requeued ?? 0, jobs: [] };
  }

  const jobs = aurral.failedJobs(playlist.id);
  const results: RetryJobResult[] = [];
  for (const job of jobs) {
    try {
      await retryJob(playlist, job);
      results.push({ id: job.id, ok: true });
    } catch (e) {
      results.push({ id: job.id, ok: false, detail: (e as Error).message });
    }
  }
  return { requeued: results.filter((r) => r.ok).length, jobs: results };
}