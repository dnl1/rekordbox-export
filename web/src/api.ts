const TOKEN_KEY = "rbx_token";

export interface JobStats {
  done: number;
  downloading: number;
  pending: number;
  failed: number;
  blocked: number;
  total: number;
}

export interface Playlist {
  id: string;
  name: string;
  kind: "shared" | "flow";
  source: string;
  sourceTrackCount: number;
  enabled: boolean;
  stats: JobStats;
  export: { files: number; size: number; dir: string };
}

export interface ExportFile {
  name: string;
  size: number;
}

export class AuthRequired extends Error {}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function withToken(url: string): string {
  const token = getToken();
  if (!token) return url;
  return url + (url.includes("?") ? "&" : "?") + `token=${encodeURIComponent(token)}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers["x-api-key"] = token;

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new AuthRequired();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function getPlaylists(): Promise<{ playlists: Playlist[] }> {
  return api("/api/playlists");
}

export function exportPlaylist(id: string): Promise<{ playlist: Playlist; export: unknown }> {
  return api(`/api/playlists/${id}/export`, { method: "POST" });
}

export function getFiles(id: string): Promise<{ dir: string; files: ExportFile[] }> {
  return api(`/api/playlists/${id}/files`);
}

export function fileUrl(id: string, name: string): string {
  return withToken(`/api/playlists/${id}/file?name=${encodeURIComponent(name)}`);
}

export function zipUrl(id: string): string {
  return withToken(`/api/playlists/${id}/zip`);
}

export function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}