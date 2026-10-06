import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleApi } from "./api.mjs";
import { build } from "../compiler/builder.mjs";

const ROOT = path.resolve(".");
const DIST = path.join(ROOT, "dist");
const CONTENT = path.join(ROOT, "content");
const SRC = path.join(ROOT, "src");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
};

export function serve(options = {}) {
  const port = Number(process.env.PORT) || options.port || 8000;

  // Make sure project is built on start
  try {
    build();
  } catch (err) {
    console.error("Первоначальная сборка завершилась с ошибкой:", err.message);
  }

  const server = http.createServer(async (req, res) => {
    // 1. CORS Preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      });
      return res.end();
    }

    const url = new URL(req.url, "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (p.length > 1 && p.endsWith("/")) {
      p = p.replace(/\/+$/, "");
    }

    // 2. API Routes
    if (p === "/api" || p.startsWith("/api/")) {
      return handleApi(req, res, p);
    }

    // 3. Static Files
    let file = path.join(DIST, p);
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end("Доступ запрещен");
      return;
    }

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { Location: `${url.pathname}/${url.search || ""}` }).end();
        return;
      }
      file = path.join(file, "index.html");
    }

    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Не найдено");
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const contentType = TYPES[ext] || "application/octet-stream";

    // Кэширование статики:
    // Шрифты и картинки неизменяемы — кэшируем надолго (1 год)
    // CSS и JS — кэшируем на 1 час с проверкой
    // HTML — no-cache для мгновенного обновления контента без мигания стилей
    let cacheControl = "no-cache";
    if (ext === ".woff2" || ext === ".woff" || ext === ".ttf") {
      cacheControl = "public, max-age=31536000, immutable";
    } else if (ext === ".css" || ext === ".js") {
      cacheControl = "public, max-age=3600, stale-while-revalidate=86400";
    } else if (ext === ".png" || ext === ".jpg" || ext === ".svg" || ext === ".webp" || ext === ".ico") {
      cacheControl = "public, max-age=86400";
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    });

    fs.createReadStream(file).pipe(res);
  });

  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    console.log(`Сервер дискретной математики запущен: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Watch for content & src changes to trigger rebuild
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (e) {
        console.error("Ошибка пересборки:", e.message);
      }
    }, 150);
  };

  if (fs.existsSync(CONTENT)) {
    fs.watch(CONTENT, { recursive: true }, rebuild);
  }
  if (fs.existsSync(SRC)) {
    fs.watch(SRC, { recursive: true }, rebuild);
  }

  return server;
}
