import { join } from "node:path";

export const env = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  aurralDb: process.env.AURRAL_DB ?? "/data/aurral/aurral.db",
  aurralApi: process.env.AURRAL_API ?? "http://172.24.0.1:3007",
  dsRoot: process.env.AURRAL_DS_ROOT ?? "/app/downloads",
  srcRoot: process.env.EXPORT_SRC_ROOT ?? "/data/downloads",
  exportRoot: process.env.EXPORT_ROOT ?? join("/data/downloads", "Rekordbox"),
};