import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "src", "app");
const sourceRoot = path.join(root, "src");

function walk(dir, predicate = () => true) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, predicate));
    else if (predicate(absolute)) files.push(absolute);
  }
  return files;
}

function routeFromPage(file) {
  const relative = path.relative(appRoot, path.dirname(file));
  if (!relative) return "/";
  const segments = relative
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .filter((segment) => !segment.startsWith("@"));
  return `/${segments.join("/")}`.replace(/\/+/g, "/") || "/";
}

function routeRegex(route) {
  if (route === "/") return /^\/$/;
  const segments = route.split("/").filter(Boolean).map((segment) => {
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:.*)?";
    if (/^\[\.\.\..+\]$/.test(segment)) return ".+";
    if (/^\[[^\]]+\]$/.test(segment)) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^/${segments.join("/")}/?$`);
}

function normalizeInternalTarget(raw) {
  if (!raw || !raw.startsWith("/")) return null;
  const clean = raw.split("#", 1)[0].split("?", 1)[0].replace(/\/$/, "") || "/";
  if (clean.includes("${") || clean.includes("[object Object]")) return null;
  return clean;
}

function classify(route) {
  const publicPrefixes = [
    "/login",
    "/cadastro",
    "/auth",
    "/m/",
    "/convite",
    "/empresa",
    "/como-funciona",
    "/entrega-e-fidelizacao",
    "/planos",
    "/precos",
    "/privacidade",
    "/termos",
  ];
  if (route === "/" || publicPrefixes.some((prefix) => route === prefix || route.startsWith(prefix))) return "public";
  if (route === "/acesso-entregador" || route.startsWith("/entregador")) return "courier";
  return "private";
}

const pageFiles = walk(appRoot, (file) => path.basename(file) === "page.tsx" || path.basename(file) === "page.ts");
const routes = [...new Set(pageFiles.map(routeFromPage))].sort();
const patterns = routes.map((route) => ({ route, regex: routeRegex(route) }));

if (routes.length === 0) {
  console.error("ROUTE_INTEGRITY: nenhuma página do App Router foi encontrada.");
  process.exit(1);
}

const sourceFiles = walk(sourceRoot, (file) => /\.(?:tsx?|jsx?)$/.test(file));
const unresolved = [];
const references = [];
const referencePatterns = [
  /\bhref\s*=\s*["'`]([^"'`]+)["'`]/g,
  /\b(?:router\.)?(?:push|replace)\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /\bredirect\s*\(\s*["'`]([^"'`]+)["'`]/g,
];

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of referencePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const raw = match[1];
      const target = normalizeInternalTarget(raw);
      if (!target) continue;
      if (target.startsWith("/api/") || target.startsWith("/_next/") || /\.[a-z0-9]{2,8}$/i.test(target)) continue;

      const line = source.slice(0, match.index).split("\n").length;
      references.push({ file: path.relative(root, file), line, target });
      if (!patterns.some(({ regex }) => regex.test(target))) {
        unresolved.push({ file: path.relative(root, file), line, target });
      }
    }
  }
}

const duplicateRoutes = routes.filter((route, index) => routes.indexOf(route) !== index);
const categories = routes.reduce((acc, route) => {
  const category = classify(route);
  acc[category] = (acc[category] ?? 0) + 1;
  return acc;
}, {});

console.log(`ROUTE_INTEGRITY: ${routes.length} páginas; ${references.length} referências internas literais.`);
console.log(`ROUTE_INTEGRITY: classificação ${JSON.stringify(categories)}.`);

if (duplicateRoutes.length > 0) {
  console.error("ROUTE_INTEGRITY: rotas duplicadas detectadas:");
  for (const route of duplicateRoutes) console.error(`- ${route}`);
  process.exitCode = 1;
}

if (unresolved.length > 0) {
  console.error("ROUTE_INTEGRITY: links/redirecionamentos internos sem página correspondente:");
  for (const item of unresolved) console.error(`- ${item.file}:${item.line} -> ${item.target}`);
  process.exitCode = 1;
}

const hasNotFound = fs.existsSync(path.join(appRoot, "not-found.tsx")) || fs.existsSync(path.join(appRoot, "not-found.ts"));
if (!hasNotFound) {
  console.error("ROUTE_INTEGRITY: src/app/not-found.tsx ausente; não há baseline explícito para 404 utilizável.");
  process.exitCode = 1;
}

if (!process.exitCode) console.log("ROUTE_INTEGRITY: OK");
