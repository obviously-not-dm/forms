#!/usr/bin/env node

/**
 * dm-trainers: Дискретная математика (ИТМО)
 * Точка входа сборщика и сервера.
 * Модульная архитектура:
 * - src/compiler/builder.mjs   - компилятор конспектов и тестов
 * - src/compiler/markdown.mjs  - Markdown + KaTeX пайплайн с callout-блоками
 * - src/compiler/templates.mjs - HTML шаблоны страниц
 * - src/server/db.mjs          - Document Store база данных (SQLite)
 * - src/server/api.mjs         - REST API маршрутизатор
 * - src/server/server.mjs      - HTTP сервер и dev-watch
 */

import { build, parseTest, serializeTest, parseNote, serializeNote } from "./src/compiler/builder.mjs";
import { serve } from "./src/server/server.mjs";

export { build, serve, parseTest, serializeTest, parseNote, serializeNote };

const args = process.argv.slice(2);
if (args.includes("--serve")) {
  serve();
} else {
  build();
}
