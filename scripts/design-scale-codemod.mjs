#!/usr/bin/env node
// Codemod da escala visual (guia visual do painel).
// Troca valores digitados à mão de font-size, font-weight e border-radius
// pelas variáveis do tema em globals.css. Uso: node scripts/design-scale-codemod.mjs [--check]
// --check: não grava; sai com código 1 se encontrar valores fora da escala.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const CHECK = process.argv.includes("--check");

// Arquivos de vitrine comercial mantêm tamanhos de destaque acima de 34px e seus clamp().
const DISPLAY_SCOPES = ["components/marketing/", "app/login/", "app/ux-v3-preview/"];
// globals.css define a escala; não é reescrito.
const SKIP_FILES = new Set(["app/globals.css"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function toPx(raw) {
  const v = raw.trim();
  let m = v.match(/^(\d*\.?\d+)px$/);
  if (m) return Number(m[1]);
  m = v.match(/^(\d*\.?\d+)rem$/);
  if (m) return Number(m[1]) * 16;
  m = v.match(/^(\d*\.?\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

function fontToken(px) {
  if (px <= 12.5) return "var(--font-size-xs)";
  if (px <= 13.5) return "var(--font-size-support)";
  if (px <= 14.5) return "var(--font-size-sm)";
  if (px <= 16.5) return "var(--font-size-md)";
  if (px <= 21) return "var(--font-size-lg)";
  if (px <= 26) return "var(--font-size-2xl)";
  if (px <= 34) return "var(--font-size-3xl)";
  return null;
}

function weightToken(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return null;
  if (n >= 700) return "var(--font-weight-bold)";
  if (n >= 600) return "var(--font-weight-semibold)";
  if (n >= 500) return "var(--font-weight-medium)";
  return "var(--font-weight-regular)";
}

function radiusToken(raw) {
  const v = raw.trim();
  if (/^50%$/.test(v) || v === "0" || v === "inherit") return null;
  const px = toPx(v);
  if (px === null) return null;
  if (px <= 4) return null; // traços e barras finas mantêm o valor
  if (px <= 10) return "var(--radius-sm)";
  if (px <= 28) return "var(--radius-lg)";
  return "var(--radius-pill)";
}

function isDisplayScope(rel) {
  return DISPLAY_SCOPES.some((s) => rel.startsWith(s));
}

const stats = { files: 0, font: 0, weight: 0, radius: 0, clamp: 0 };

function rewriteCss(text, rel) {
  const display = isDisplayScope(rel);
  // font-size
  text = text.replace(/font-size(\s*:\s*)([^;{}"'\n]+?)(\s*!important)?(?=\s*[;}"'\n])/g, (all, sep1, value, imp = "") => {
    const v = value.trim();
    if (v.startsWith("var(") || v.startsWith("calc(") || /(?<!r)em$|%$|^0$|inherit|initial|unset/.test(v)) return all;
    if (v.startsWith("clamp(")) {
      if (display) return all;
      const max = toPx(v.replace(/^clamp\(/, "").replace(/\)$/, "").split(",").at(-1) ?? "");
      if (max !== null && max <= 42) { stats.clamp++; return `font-size${sep1}var(--font-size-2xl)${imp}`; }
      return all;
    }
    const px = toPx(v);
    if (px === null) return all;
    if (display && px > 34) return all;
    const t = fontToken(px);
    if (!t) return all;
    stats.font++;
    return `font-size${sep1}${t}${imp}`;
  });
  // font-weight
  text = text.replace(/font-weight(\s*:\s*)(\d{3})(\s*!important)?/g, (all, sep1, w, imp = "") => {
    const t = weightToken(w);
    if (!t) return all;
    stats.weight++;
    return `font-weight${sep1}${t}${imp}`;
  });
  // border-radius (um só valor)
  text = text.replace(/border-radius(\s*:\s*)([^;{}"'\n]+?)(\s*!important)?(?=\s*[;}"'\n])/g, (all, sep1, value, imp = "") => {
    const v = value.trim();
    if (/\s/.test(v)) return all;
    const t = radiusToken(v);
    if (!t) return all;
    stats.radius++;
    return `border-radius${sep1}${t}${imp}`;
  });
  return text;
}

function rewriteTsx(text, rel) {
  const display = isDisplayScope(rel);
  text = text.replace(/\bfontSize:\s*(?:"([^"]+)"|'([^']+)'|(\d*\.?\d+))/g, (all, dq, sq, num) => {
    const v = (dq ?? sq ?? num).trim();
    if (v.startsWith("var(")) return all;
    if (v.startsWith("clamp(")) {
      if (display) return all;
      const max = toPx(v.replace(/^clamp\(/, "").replace(/\)$/, "").split(",").at(-1) ?? "");
      if (max !== null && max <= 42) { stats.clamp++; return 'fontSize: "var(--font-size-2xl)"'; }
      return all;
    }
    const px = toPx(v);
    if (px === null) return all;
    if (display && px > 34) return all;
    const t = fontToken(px);
    if (!t) return all;
    stats.font++;
    return `fontSize: "${t}"`;
  });
  text = text.replace(/\bfontWeight:\s*(?:"(\d{3})"|'(\d{3})'|(\d{3}))\b/g, (all, dq, sq, num) => {
    const t = weightToken(dq ?? sq ?? num);
    if (!t) return all;
    stats.weight++;
    return `fontWeight: "${t}"`;
  });
  text = text.replace(/\bborderRadius:\s*(?:"([^"]+)"|'([^']+)'|(\d*\.?\d+))/g, (all, dq, sq, num) => {
    const v = (dq ?? sq ?? num).trim();
    if (/\s/.test(v)) return all;
    const t = radiusToken(v);
    if (!t) return all;
    stats.radius++;
    return `borderRadius: "${t}"`;
  });
  return text;
}

const changed = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  if (SKIP_FILES.has(rel)) continue;
  const before = readFileSync(file, "utf8");
  const after = file.endsWith(".css") ? rewriteCss(before, rel) : rewriteTsx(before, rel);
  if (after !== before) {
    changed.push(rel);
    if (!CHECK) writeFileSync(file, after);
  }
}
stats.files = changed.length;
console.log(JSON.stringify(stats));
if (CHECK && changed.length) {
  console.log(changed.join("\n"));
  process.exit(1);
}
