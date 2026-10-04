import katex from "katex";
import { Marked } from "marked";

const CALLOUT_ICONS = {
  note: "ℹ️",
  tip: "💡",
  important: "📌",
  warning: "⚠️",
  caution: "🛑",
};

const CALLOUT_TITLES = {
  note: "Заметка",
  tip: "Совет",
  important: "Важно",
  warning: "Внимание",
  caution: "Осторожно",
};

export function renderKatex(tex, displayMode = false) {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      output: "htmlAndMathml",
    });
  } catch (err) {
    return `<span class="katex-error" title="${escapeHtml(err.message)}">${escapeHtml(tex)}</span>`;
  }
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function imageHtml(href, text, title, kind = "fig fig-png") {
  const t = title ? ` title="${escapeHtml(title)}"` : "";
  const alt = escapeHtml(text || "");
  const c = escapeHtml(text || "");
  return `<figure class="${kind}"><img src="${escapeHtml(href)}" alt="${alt}" loading="lazy"${t}><figcaption>${c}</figcaption></figure>`;
}

export function renderMarkdown(rawText, options = {}) {
  const mathPlaceholders = new Map();
  let phCounter = 0;
  const errors = [];
  const used = { math: false };

  // 1. Protect display math $$...$$
  let text = String(rawText || "").replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    used.math = true;
    const ph = `%%MATH_DISPLAY_${phCounter++}%%`;
    const rendered = renderKatex(tex.trim(), true);
    mathPlaceholders.set(ph, `<div class="katex-display">${rendered}</div>`);
    return ph;
  });

  // 2. Protect inline math $...$
  text = text.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_, tex) => {
    used.math = true;
    const ph = `%%MATH_INLINE_${phCounter++}%%`;
    const rendered = renderKatex(tex.trim(), false);
    mathPlaceholders.set(ph, rendered);
    return ph;
  });

  // 2.5. Normalize standalone callouts (without leading '>') so Marked treats them as blockquotes
  text = text.replace(/(?:^|\n)([ \t]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n[^\n]+)*)/gi, (m, block) => {
    const lines = block.split("\n");
    const quoted = lines.map(line => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith(">")) return line;
      return "> " + line;
    }).join("\n");
    return "\n" + quoted;
  });

  // 3. Configure Marked renderer
  const md = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      image({ href, text: altText, title }) {
        const lower = String(href).toLowerCase();
        const photo = lower.includes("photo") || lower.includes("img_") || lower.includes("dsc_");
        const kind = photo ? "photo" : lower.endsWith(".svg") ? "fig fig-svg" : "fig fig-png";
        return imageHtml(href, altText, title, kind);
      },
      blockquote(token) {
        // Check if blockquote starts with a callout header [!NOTE], [!TIP], etc.
        const rawContent = (token.text || "").trim();
        const calloutMatch = rawContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*?\n|\s+|$)/i);

        if (calloutMatch) {
          const type = calloutMatch[1].toLowerCase();
          const icon = CALLOUT_ICONS[type] || "ℹ️";
          const title = CALLOUT_TITLES[type] || type.toUpperCase();

          // Prepare tokens without the [!TYPE] marker
          let bodyHtml = "";
          if (token.tokens && this.parser) {
            // Deep clone tokens to avoid mutating the original token tree
            const tokens = JSON.parse(JSON.stringify(token.tokens));
            if (tokens.length > 0) {
              const firstToken = tokens[0];
              if (firstToken.type === "paragraph" || firstToken.type === "text") {
                firstToken.raw = firstToken.raw.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*?\n|\s+|$)/i, "");
                firstToken.text = (firstToken.text || "").replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*?\n|\s+|$)/i, "");
                if (firstToken.tokens) {
                  // Clean child inline tokens if needed
                  if (firstToken.tokens.length > 0 && firstToken.tokens[0].text) {
                    firstToken.tokens[0].text = firstToken.tokens[0].text.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*?\n|\s+|$)/i, "");
                    if (!firstToken.tokens[0].text.trim()) {
                      firstToken.tokens.shift();
                    }
                  }
                }
                if (!firstToken.text.trim()) {
                  tokens.shift();
                }
              }
            }
            bodyHtml = this.parser.parse(tokens);
          } else {
            const stripped = rawContent.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*?\n|\s+|$)/i, "");
            bodyHtml = `<p>${escapeHtml(stripped)}</p>`;
          }

          return `<div class="note-callout callout-${type}">
  <div class="callout-header"><span class="callout-icon">${icon}</span> <span class="callout-title">${title}</span></div>
  <div class="callout-body">
${bodyHtml.trim()}
  </div>
</div>\n`;
        }

        const body = this.parser ? this.parser.parse(token.tokens) : token.text;
        return `<blockquote>\n${body}\n</blockquote>\n`;
      },
      heading({ text: headingText, depth }) {
        const id = headingText
          .toLowerCase()
          .replace(/<[^>]+>/g, "")
          .replace(/[^\p{L}\p{N}]+/gu, "-")
          .replace(/^-|-$/g, "");
        return `<h${depth} id="${id}">${headingText}</h${depth}>\n`;
      },
    },
  });

  let html = md.parse(text);

  // 4. Restore KaTeX formulas from placeholders
  for (const [ph, rendered] of mathPlaceholders.entries()) {
    html = html.split(ph).join(rendered);
  }

  return { html, usedMath: used.math, errors };
}
