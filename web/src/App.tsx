import { useCallback, useEffect, useRef, useState } from "react";
import {
  AuthRequired,
  exportPlaylist,
  fileUrl,
  fmtBytes,
  getFiles,
  getPlaylists,
  getToken,
  setToken,
  type ExportFile,
  type Playlist,
  zipUrl,
} from "./api.ts";

const POLL_MS = 15000;

function PlaylistCard({
  playlist,
  onExported,
}: {
  playlist: Playlist;
  onExported: (p: Playlist) => void;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ExportFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggleFiles = useCallback(async () => {
    setOpen((o) => !o);
    if (files === null) {
      try {
        setFiles((await getFiles(playlist.id)).files);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "erro ao listar");
      }
    }
  }, [files, playlist.id]);

  const doExport = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await exportPlaylist(playlist.id);
      onExported(res.playlist);
      const exp = res.export as { copied?: number; files: number };
      setMsg(exp.copied && exp.copied > 0 ? `${exp.copied} copiadas` : "já em dia");
      setFiles((await getFiles(playlist.id)).files);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro ao exportar");
    } finally {
      setBusy(false);
    }
  }, [onExported, playlist.id]);

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
          <span className="src-note">· {playlist.enabled ? "ativa" : "pausada"}</span>
        </div>
      </div>

      <div className="chips">
        {chip("done", s.done, "ok")}
        {chip("baixando", s.downloading, "dl")}
        {chip("pendente", s.pending, "pend")}
        {chip("falha", s.failed, "fail")}
        {chip("blocked", s.blocked, "fail")}
      </div>

      <div className="export-info">
        <span>Pasta Rekordbox: <b>{playlist.export.files}</b> arquivos</span>
        <span className="muted">{fmtBytes(playlist.export.size)}</span>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={doExport} disabled={busy}>
          {busy ? "Exportando…" : "Exportar"}
        </button>
        {playlist.export.files > 0 && (
          <a className="btn" href={zipUrl(playlist.id)}>Baixar ZIP ({fmtBytes(playlist.export.size)})</a>
        )}
        <button className="btn ghost" onClick={toggleFiles}>
          {open ? "Ocultar" : "Arquivos"}
        </button>
      </div>
      {msg && <div className="msg">{msg}</div>}

      {open && (
        <div className="filelist">
          {files === null ? (
            <div className="muted">carregando…</div>
          ) : files.length === 0 ? (
            <div className="muted">nenhum arquivo exportado ainda</div>
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
    </div>
  );
}

export default function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [token, setTokenState] = useState(getToken());
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setError("");
      setRefreshing(true);
      const data = await getPlaylists();
      setPlaylists(data.playlists);
      setNeedsAuth(false);
    } catch (e) {
      if (e instanceof AuthRequired) setNeedsAuth(true);
      else setError(e instanceof Error ? e.message : "erro ao carregar");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (!needsAuth) void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [needsAuth, refresh]);

  const saveToken = () => {
    const t = inputRef.current?.value.trim() ?? "";
    setToken(t);
    setTokenState(t);
    setNeedsAuth(false);
    void refresh();
  };

  const onExported = (p: Playlist) =>
    setPlaylists((ps) => ps.map((x) => (x.id === p.id ? p : x)));

  return (
    <div className="wrap">
      <header>
        <h1>🎛️ Rekordbox Export</h1>
        <div className="head-right">
          <span className="muted">{playlists.length} playlists</span>
          <span className={`dot ${refreshing ? "spin" : ""}`} title="atualizando" />
          <button className="btn ghost" onClick={() => void refresh()} disabled={refreshing}>
            Atualizar
          </button>
        </div>
      </header>

      {error && <div className="banner err">{error}</div>}

      {needsAuth && (
        <div className="banner auth">
          <b>Token de acesso necessário.</b>
          <input ref={inputRef} type="password" placeholder="cole o token" />
          <button className="btn primary" onClick={saveToken}>Salvar</button>
        </div>
      )}

      {token && !needsAuth && (
        <div className="banner subtle">Token configurado ({token.slice(0, 4)}…).</div>
      )}

      <main className="grid">
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} onExported={onExported} />
        ))}
      </main>

      <footer className="muted">
        Lê os downloads do Aurral e monta a pasta de export pronta para o Rekordbox.
      </footer>
    </div>
  );
}