import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../print-agent/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (pkg.version !== manifest.version) throw new Error("Print Agent version mismatch");
// Dependencies before entry points also help the one-time legacy updater hop.
manifest.files = [...manifest.files.filter(file => !["src/index.mjs", "src/updater.mjs", "manifest.json", "package.json"].includes(file)), "src/index.mjs", "src/updater.mjs", "manifest.json", "package.json"];
manifest.sha256 = {};
for (const file of manifest.files) {
  if (file !== "manifest.json") manifest.sha256[file] = createHash("sha256").update(await readFile(new URL(file, root))).digest("hex");
}
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared Print Agent ${manifest.version} with ${manifest.files.length - 1} integrity hashes.`);
