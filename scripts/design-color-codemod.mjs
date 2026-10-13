#!/usr/bin/env node
// Codemod de cores (guia visual): troca cores fixas por variáveis do tema e
// garante texto legível sobre laranja e vermelho (var(--text-on-brand)).
// Uso: node scripts/design-color-codemod.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const CHECK = process.argv.includes("--check");
// O site comercial tem paleta própria de vitrine; globals.css define o tema.
const SKIP = ["app/globals.css", "components/marketing/", "app/login/", "app/ux-v3-preview/"];

const HEX_TO_TOKEN = new Map([
  ["#ff6b00", "var(--brand-primary)"],
  ["#22c55e", "var(--state-success)"], ["#16a34a", "var(--state-success)"], ["#15803d", "var(--state-success)"], ["#2aa866", "var(--state-success)"],
  ["#75c88a", "var(--state-success-text)"],
  ["#ef4444", "var(--state-danger)"], ["#d92d20", "var(--state-danger)"], ["#b91c1c", "var(--state-danger)"], ["#b42318", "var(--state-danger)"],
  ["#f97066", "var(--state-danger-text)"], ["#ff8a93", "var(--state-danger-text)"],
  ["#f59e0b", "var(--state-warning)"], ["#d97706", "var(--state-warning)"],
]);

const STRONG_FILL = /background(?:-color)?\s*:\s*["']?var\(--(?:accent|accent-strong|brand-primary|brand-primary-hover|state-danger|danger)\)|background(?:Color)?:\s*["']var\(--(?:accent|accent-strong|brand-primary|brand-primary-hover|state-danger|danger)\)/;
const WHITE_TEXT_CSS = /(^|[;{\s])color\s*:\s*(?:#fff(?:fff)?|white)\b/gi;
const WHITE_TEXT_TSX = /\bcolor:\s*["'](?:#fff(?:fff)?|white)["']/gi;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const stats = { files: 0, hex: 0, onBrand: 0 };

function mapHex(text, isCss) {
  // Em .tsx, só valores de objetos de estilo ("#hex"); atributos SVG ficam como estão.
  const pattern = isCss ? /#[0-9a-fA-F]{6}\b/g : /(?<=:\s*["'])#[0-9a-fA-F]{6}(?=["'])/g;
  return text.replace(pattern, (hex) => {
    const token = HEX_TO_TOKEN.get(hex.toLowerCase());
    if (!token) return hex;
    stats.hex++;
    return token;
  });
}

function fixBlocks(text, isCss) {
  // Blocos sem chaves internas: uma regra CSS ou um objeto de estilo.
  return text.replace(/\{[^{}]*\}/g, (block) => {
    if (!STRONG_FILL.test(block)) return block;
    if (isCss) {
      return block.replace(WHITE_TEXT_CSS, (all, lead) => { stats.onBrand++; return `${lead}color:var(--text-on-brand)`; });
    }
    return block.replace(WHITE_TEXT_TSX, () => { stats.onBrand++; return 'color: "var(--text-on-brand)"'; });
  });
}

const changed = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  if (SKIP.some((s) => rel.startsWith(s))) continue;
  const before = readFileSync(file, "utf8");
  const isCss = file.endsWith(".css");
  const after = fixBlocks(mapHex(before, isCss), isCss);
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
