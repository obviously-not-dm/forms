// Проверка ответов. Работает и в браузере, и при сборке (проверка ключей).
// Вопрос здесь — запись из key.json: { id, type, answer, compare?, labels? }.

const LOOKALIKE = { а: "a", с: "c", е: "e", о: "o", р: "p", х: "x", у: "y" };

export function normalize(s) {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[асеорху]/g, (ch) => LOOKALIKE[ch])
    .replace(/∅/g, "{}")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

// Множество сравнивается без учёта порядка и повторов, в том числе вложенное:
// {{}, {1}, {2}, {1, 2}} = {{2, 1}, {}, {1}, {2}}. Пары и кортежи (a, b) внутри — с учётом порядка.
function canonical(t) {
  if (t === "") return null;
  const open = t[0];
  if (open !== "{" && open !== "(") return /[{}(),;]/.test(t) ? null : t;
  const close = open === "{" ? "}" : ")";
  if (t.at(-1) !== close) return null;
  const inner = t.slice(1, -1);
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "{" || ch === "(") depth++;
    else if (ch === "}" || ch === ")") depth--;
    else if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  if (inner !== "") parts.push(inner.slice(start));
  const items = parts.map(canonical);
  if (items.some((x) => x === null)) return null;
  if (open === "(") return `(${items.join(",")})`;
  return `{${[...new Set(items)].sort().join(",")}}`;
}

export function parseSet(s) {
  const t = normalize(s);
  return t.startsWith("{") ? canonical(t) : null;
}

export function parseNumber(s) {
  const t = String(s ?? "").trim().replace(/[−–—]/, "-").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

export function guessCompare(answers) {
  if (answers.every((a) => parseNumber(a) !== null)) return "number";
  if (answers.every((a) => parseSet(a) !== null)) return "set";
  return "text";
}

function canon(q, v) {
  if (q.compare === "number") return parseNumber(v);
  if (q.compare === "set") return parseSet(v);
  return normalize(v);
}

export function isAnswered(type, value) {
  if (type === "multiple") return Array.isArray(value) && value.length > 0;
  if (type === "single") return Number.isInteger(value);
  return typeof value === "string" && value.trim() !== "";
}

export function isCorrect(q, value) {
  if (!isAnswered(q.type, value)) return false;
  if (q.type === "single") return value === q.answer[0];
  if (q.type === "multiple") {
    return [...value].sort().join() === [...q.answer].sort().join();
  }
  const v = canon(q, value);
  return v !== null && q.answer.some((a) => canon(q, a) === v);
}

export function grade(questions, answers) {
  const results = {};
  let score = 0;
  for (const q of questions) {
    results[q.id] = isCorrect(q, answers[q.id]);
    if (results[q.id]) score++;
  }
  return { score, max: questions.length, results };
}

export function describe(q, value) {
  if (!isAnswered(q.type, value)) return "нет ответа";
  if (q.type === "text") return String(value).trim();
  const idx = q.type === "single" ? [value] : [...value].sort((a, b) => a - b);
  return idx.map((i) => q.labels[i]).join("; ");
}

export const LETTERS = "АБВГДЕЖЗИК";
