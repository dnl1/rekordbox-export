import { DatabaseSync } from "node:sqlite";
import { env } from "./config.ts";

export interface Playlist {
  id: string;
  name: string;
  kind: "shared" | "flow";
  source: string;
  sourceTrackCount: number;
  enabled: boolean;
}

export interface JobStats {
  done: number;
  downloading: number;
  pending: number;
  failed: number;
  blocked: number;
  total: number;
}

export interface DoneJob {
  artistName: string;
  trackName: string;
  finalPath: string;
  createdAt: number;
}

export interface FailedJob {
  id: string;
  artistName: string;
  trackName: string;
  albumName: string | null;
  status: string;
  error: string | null;
  createdAt: number | null;
  completedAt: number | null;
}

interface RawPlaylist {
  id: string;
  name: string;
  ownerUserId?: number;
  enabled?: boolean;
  sourceName?: string;
  size?: number;
  tracks?: Array<{ artistName?: string; trackName?: string }>;
  importSource?: { provider?: string; externalName?: string };
}

const STATUSES = ["done", "downloading", "pending", "failed", "blocked"] as const;

class Aurral {
  #db: DatabaseSync;

  constructor() {
    this.#db = new DatabaseSync(env.aurralDb, { readOnly: true });
  }

  #settings(): Map<string, string> {
    const rows = this.#db
      .prepare("SELECT key, value FROM settings")
      .all() as Array<{ key: string; value: string }>;
    return new Map(rows.map((r) => [r.key, r.value]));
  }

  #json(map: Map<string, string>, key: string): unknown {
    const v = map.get(key);
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  playlists(): Playlist[] {
    const s = this.#settings();
    const shared = (this.#json(s, "sharedPlaylists") as RawPlaylist[] | null) ?? [];
    const flows =
      (this.#json(s, "flows") as RawPlaylist[] | null) ??
      (this.#json(s, "weeklyFlows") as RawPlaylist[] | null) ??
      [];

    const PROVIDER_LABELS: Record<string, string> = {
  "spotify-playlist": "Spotify",
  lidarr: "Lidarr",
  "weekly-flow": "Weekly Flow",
  manual: "Manual",
};

const mapOne = (p: RawPlaylist, kind: Playlist["kind"]): Playlist => ({
      id: p.id,
      name: p.name,
      kind,
      source:
        kind === "flow"
          ? "Weekly Flow"
          : (PROVIDER_LABELS[p.importSource?.provider ?? ""] ??
            p.importSource?.provider ??
            p.sourceName ??
            "Unknown"),
      sourceTrackCount: kind === "shared" ? p.tracks?.length ?? 0 : p.size ?? 0,
      enabled: p.enabled ?? true,
    });

    return [...shared.map((p) => mapOne(p, "shared")), ...flows.map((p) => mapOne(p, "flow"))];
  }

  jobStats(playlistId: string): JobStats {
    const rows = this.#db
      .prepare(
        "SELECT status, COUNT(*) AS c FROM playlist_download_jobs WHERE playlist_id = ? GROUP BY status",
      )
      .all(playlistId) as Array<{ status: string; c: number }>;
    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = Number(r.c);
    const stats = {
      done: by.done ?? 0,
      downloading: by.downloading ?? 0,
      pending: by.pending ?? 0,
      failed: by.failed ?? 0,
      blocked: by.blocked ?? 0,
      total: 0,
    };
    stats.total = STATUSES.reduce((sum, st) => sum + (by[st] ?? 0), 0);
    return stats;
  }

  doneJobs(playlistId: string): DoneJob[] {
    const rows = this.#db
      .prepare(
        `SELECT artist_name, track_name, final_path, created_at
         FROM playlist_download_jobs
         WHERE playlist_id = ? AND status = 'done' AND final_path IS NOT NULL
         ORDER BY created_at ASC`,
      )
      .all(playlistId) as Array<{
      artist_name: string;
      track_name: string;
      final_path: string;
      created_at: number;
    }>;
    return rows.map((r) => ({
      artistName: r.artist_name,
      trackName: r.track_name,
      finalPath: r.final_path,
      createdAt: r.created_at,
    }));
  }

  failedJobs(playlistId: string, limit = 200): FailedJob[] {
    const rows = this.#db
      .prepare(
        `SELECT id, artist_name, track_name, album_name, status, error, created_at, completed_at
         FROM playlist_download_jobs
         WHERE playlist_id = ? AND status IN ('failed', 'blocked')
         ORDER BY (created_at IS NULL) ASC, created_at DESC
         LIMIT ?`,
      )
      .all(playlistId, limit) as Array<{
      id: string;
      artist_name: string;
      track_name: string;
      album_name: string | null;
      status: string;
      error: string | null;
      created_at: number | null;
      completed_at: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      artistName: r.artist_name,
      trackName: r.track_name,
      albumName: r.album_name,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  }

  sessionToken(): string | undefined {
    const rows = this.#db
      .prepare(
        "SELECT token FROM sessions WHERE expires_at > ? ORDER BY created_at DESC LIMIT 1",
      )
      .all(Date.now()) as Array<{ token: string }>;
    return rows[0]?.token;
  }
}

export const aurral = new Aurral();