# Rekordbox Export

Turn Aurral's downloaded playlists into ready-to-mix Rekordbox folders.

![UI](https://img.shields.io/badge/UI-React%2019-%236c5ce7) ![API](https://img.shields.io/badge/API-Fastify%205-%23000000) ![license](https://img.shields.io/badge/license-MIT-blue)

A small self-hosted web app that:

- Lists the playlists and weekly flows Aurral is downloading (Sparkify/Aurral SQLite DB).
- Shows live per-playlist download status (done / downloading / pending / failed / blocked).
- Exports the finished tracks into a clean folder
  `Rekordbox/<Playlist Name>/NN - Artist - Track.ext` (FLAC/MP3/M4A) ready to
  drag into Rekordbox.
- Streams the whole export back as a **ZIP** or downloads individual files.

It's read-only against the Aurral database and never touches the downloads —
it just copies finished files into the export folder.

## How it works

- **Data source:** reads `playlist_download_jobs` from Aurral's SQLite DB
  (read-only), plus the `sharedPlaylists` / `flows` settings.
- **Export:** copies every job with `status='done'` from the download root into
  `EXPORT_ROOT/<Playlist>/`, numbering tracks by import order.
- **Transfer:** packs the export folder as a ZIP on the fly, or streams single
  files.

![flow](https://user-images.githubusercontent.com/placeholder/grid.png)

## Stack

- **Backend:** Fastify 5 + Node 24 (`node:sqlite`, native no build step),
  `archiver` for ZIPs.
- **Frontend:** React 19 + Vite, dark homelab-themed UI.
- **Deploy:** Docker (multi-stage) or bare `node`.

## Run with Docker

```bash
cp .env.example .env            # fill in your paths + AUTH_TOKEN
docker compose up -d --build
```

`AUTH_TOKEN` (optional) protects every `/api/*` route. The web UI asks for the
token once and remembers it in `localStorage`.

### Environment

| Variable           | Default               | Meaning                                              |
|--------------------|-----------------------|------------------------------------------------------|
| `AURRAL_DB`        | `/data/aurral/aurral.db` | Aurral SQLite database (mount read-only)             |
| `AURRAL_DS_ROOT`   | `/app/downloads`      | Container download root used in Aurral `final_path`  |
| `EXPORT_SRC_ROOT`  | `/data/downloads`     | Where those files live from this container's view    |
| `EXPORT_ROOT`      | `/data/downloads/Rekordbox` | Output folder for `Rekordbox/<Playlist>`         |
| `AUTH_TOKEN`       | *(empty)*             | Require this token on `/api/*`                       |
| `PORT` / `HOST`    | `3001` / `0.0.0.0`    | HTTP bind                                            |

Volumes: mount the whole Aurral data dir (WAL needs the `-wal`/`-shm`
sidecars) and the download root.

## Run without Docker

```bash
cd server && npm install && \
  AURRAL_DB=/path/aurral.db \
  EXPORT_SRC_ROOT=/path/downloads \
  EXPORT_ROOT=/path/downloads/Rekordbox \
  node src/index.ts
cd ../web && npm install && npm run dev   # frontend dev server (proxy to :5173)
```

If `web/dist` is missing the server runs API-only.

## API

| Method | Route                         | Description                            |
|--------|-------------------------------|----------------------------------------|
| GET    | `/api/health`                 | Liveness                              |
| GET    | `/api/playlists`              | Playlists/flows + status + export info |
| GET    | `/api/playlists/:id/export`   | Current export summary                |
| POST   | `/api/playlists/:id/export`   | (Re)build the export folder           |
| GET    | `/api/playlists/:id/files`    | Files currently exported              |
| GET    | `/api/playlists/:id/file?name=`| Download one file                    |
| GET    | `/api/playlists/:id/zip`      | Download the whole export as ZIP      |

Set the token with header `x-api-key` or query `?token=` when `AUTH_TOKEN` is
configured.

## License

MIT