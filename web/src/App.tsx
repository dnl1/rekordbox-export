import { useCallback, useEffect, useState } from "react";
import {
  exportPlaylist,
  fileUrl,
  fmtBytes,
  getFailedJobs,
  getFiles,
  getPlaylists,
  retryJob,
  retryPlaylist,
  type ExportFile,
  type FailedJob,
  type Playlist,
  zipUrl,
} from "./api.ts";

const POLL_MS = 15000;

function PlaylistCard({
  playlist,
  onExported,
  onRefresh,
}: {
  playlist: Playlist;
  onExported: (p: Playlist) => void;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ExportFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [showFailures, setShowFailures] = useState(false);
  const [failures, setFailures] = useState<FailedJob[] | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryAllBusy, setRetryAllBusy] = useState(false);
  const [failMsg, setFailMsg] = useState("");

  const failureCount = playlist.stats.failed + playlist.stats.blocked;

  const toggleFiles = useCallback(async () => {
    setOpen((o) => !o);
    if (files === null) {
      try {
        setFiles((await getFiles(playlist.id)).files);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "failed to list files");
      }
    }
  }, [files, playlist.id]);

  const loadFailures = useCallback(async () => {
    setFailMsg("");
    try {
      const { jobs } = await getFailedJobs(playlist.id);
      setFailures(jobs);
    } catch (e) {
      setFailMsg(e instanceof Error ? e.message : "failed to load failures");
    }
  }, [playlist.id]);

  const toggleFailures = useCallback(() => {
    setShowFailures((s) => !s);
    if (failures === null) void loadFailures();
  }, [failures, loadFailures]);

  const doRetryJob = useCallback(
    async (job: FailedJob) => {
      setRetryingId(job.id);
      setFailMsg("");
      try {
        await retryJob(playlist.id, job.id);
        await loadFailures();
        await onRefresh();
      } catch (e) {
        setFailMsg(e instanceof Error ? e.message : "retry failed");
      } finally {
        setRetryingId(null);
      }
    },
    [loadFailures, onRefresh, playlist.id],
  );

  const doRetryAll = useCallback(async () => {
    setRetryAllBusy(true);
    setFailMsg("");
    try {
      const res = await retryPlaylist(playlist.id);
      setFailMsg(`requeued ${res.requeued}`);
      await loadFailures();
      await onRefresh();
    } catch (e) {
      setFailMsg(e instanceof Error ? e.message : "retry failed");
    } finally {
      setRetryAllBusy(false);
    }
  }, [loadFailures, onRefresh, playlist.id]);

  const doExport = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await exportPlaylist(playlist.id);
      onExported(res.playlist);
      const exp = res.export as { copied?: number; files: number };
      setMsg(exp.copied && exp.copied > 0 ? `${exp.copied} copied` : "up to date");
      setFiles((await getFiles(playlist.id)).files);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "export failed");
    } finally {
      setBusy(false);
    }
  }, [onExported, playlist.id]);

  useEffect(() => {
    if (!showFailures) return;
    void loadFailures();
    const t = setInterval(() => void loadFailures(), POLL_MS);
    return () => clearInterval(t);
  }, [showFailures, loadFailures]);

  const s = playlist.stats;
  const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
  const chip = (label: string, n: number, cls: string) =>
    n > 0 ? <span className={`chip ${cls}`}>{label} {n}</span> : null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <span className={`badge ${playlist.kind}`}>{playlist.kind === "flow" ? "Flow" : "Playlist"}</span>
          <h3>{playlist.name}</h3>
        </div>
        <span className="src">{playlist.source}</span>
      </div>

      <div className="progress">
        <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
        <div className="prog-label">
          <b>{s.done}/{s.total}</b>
          {s.total > 0 && <span> ({pct}%)</span>}
          <span className="src-note">· {playlist.enabled ? "active" : "paused"}</span>
        </div>
      </div>

      <div className="chips">
        {chip("done", s.done, "ok")}
        {chip("downloading", s.downloading, "dl")}
        {chip("pending", s.pending, "pend")}
        {chip("failed", s.failed, "fail")}
        {chip("blocked", s.blocked, "fail")}
      </div>

      <div className="export-info">
        <span>Rekordbox folder: <b>{playlist.export.files}</b> files</span>
        <span className="muted">{fmtBytes(playlist.export.size)}</span>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={doExport} disabled={busy}>
          {busy ? "Exporting…" : "Export"}
        </button>
        {playlist.export.files > 0 && (
          <a className="btn" href={zipUrl(playlist.id)}>Download ZIP ({fmtBytes(playlist.export.size)})</a>
        )}
        <button className="btn ghost" onClick={toggleFiles}>
          {open ? "Hide" : "Files"}
        </button>
        {failureCount > 0 && (
          <button className="btn danger" onClick={toggleFailures}>
            {showFailures ? "Hide failures" : `Failures (${failureCount})`}
          </button>
        )}
      </div>
      {msg && <div className="msg">{msg}</div>}

      {open && (
        <div className="filelist">
          {files === null ? (
            <div className="muted">loading…</div>
          ) : files.length === 0 ? (
            <div className="muted">no files exported yet</div>
          ) : (
            <ul>
              {files.map((f) => (
                <li key={f.name}>
                  <span className="fname">{f.name}</span>
                  <span className="muted fsize">{fmtBytes(f.size)}</span>
                  <a className="mini" href={fileUrl(playlist.id, f.name)}>↓</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showFailures && (
        <div className="filelist failures">
          <div className="fail-head">
            <b>Failed / blocked tracks</b>
            <button
              className="btn primary small"
              onClick={() => void doRetryAll()}
              disabled={retryAllBusy || failures === null || failures.length === 0}
            >
              {retryAllBusy ? "Retrying…" : `Retry all (${failures?.length ?? "…"})`}
            </button>
          </div>
          {failMsg && <div className="msg">{failMsg}</div>}
          {failures === null ? (
            <div className="muted">loading…</div>
          ) : failures.length === 0 ? (
            <div className="muted">nothing failed — all clear</div>
          ) : (
            <ul>
              {failures.map((f) => (
                <li key={f.id} className="fail-row">
                  <div className="fail-info">
                    <span className="chip fail">{f.status}</span>
                    <span className="fname">{f.artistName} — {f.trackName}</span>
                  </div>
                  {f.error && <div className="fail-error" title={f.error}>{f.error}</div>}
                  <button
                    className="btn ghost small"
                    onClick={() => void doRetryJob(f)}
                    disabled={retryingId !== null}
                  >
                    {retryingId === f.id ? "Retrying…" : "Retry"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError("");
      setRefreshing(true);
      const data = await getPlaylists();
      setPlaylists(data.playlists);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const onExported = (p: Playlist) =>
    setPlaylists((ps) => ps.map((x) => (x.id === p.id ? p : x)));

  return (
    <div className="wrap">
      <header>
        <h1>🎛️ Rekordbox Export</h1>
        <div className="head-right">
          <span className="muted">{playlists.length} playlists</span>
          <span className={`dot ${refreshing ? "spin" : ""}`} title="refreshing" />
          <button className="btn ghost" onClick={() => void refresh()} disabled={refreshing}>
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="banner err">{error}</div>}

      <main className="grid">
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} onExported={onExported} onRefresh={refresh} />
        ))}
      </main>

      <footer className="muted">
        Reads Aurral's downloads and builds export folders ready for Rekordbox.
      </footer>
    </div>
  );
}