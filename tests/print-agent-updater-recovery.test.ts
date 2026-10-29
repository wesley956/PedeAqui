import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
// @ts-expect-error Native agent runtime.
import { updateAgent } from "../print-agent/src/updater-core.mjs";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "pedeaqui-update-")); directories.push(rootDir);
  await mkdir(path.join(rootDir, "src"));
  await writeFile(path.join(rootDir, "src/index.mjs"), "// old runtime\n");
  await writeFile(path.join(rootDir, "package.json"), '{"version":"0.7.3"}');
  const contents: Record<string, string> = {
    "src/index.mjs": 'import "./diagnostics.mjs";\n', "src/diagnostics.mjs": "export const ready = true;\n",
    "src/updater.mjs": 'import "./updater-core.mjs";\n', "src/updater-core.mjs": "export const ready = true;\n", "package.json": '{"version":"0.8.0"}',
  };
  const manifest = { version: "0.8.0", files: [...Object.keys(contents), "manifest.json"], sha256: Object.fromEntries(Object.entries(contents).map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")])) };
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    const file = new URL(url).pathname.split("/print-agent/")[1];
    return new Response(file === "manifest.json" ? JSON.stringify(manifest) : contents[file!]);
  });
  return { rootDir, contents, manifest, fetcher, options: { rootDir, fetcher, log: vi.fn() } };
}
describe("recoverable Print Agent update", () => {
  it("ships matching hashes for every release file", async () => {
    const root = path.resolve("print-agent");
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
    for (const file of manifest.files as string[]) {
      if (file !== "manifest.json") expect(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")).toBe(manifest.sha256[file]);
    }
  });
  it("validates all downloads before activation and updates the version last", async () => {
    const test = await fixture(); const order: string[] = [];
    expect(await updateAgent({ ...test.options, beforeActivate: (file: string) => { order.push(file); } })).toEqual({ status: "updated" });
    expect(order.at(-1)).toBe("package.json");
    expect(JSON.parse(await readFile(path.join(test.rootDir, "package.json"), "utf8")).version).toBe("0.8.0");
  });
  it("leaves the current version intact on a truncated or changed download", async () => {
    const test = await fixture(); test.contents["src/index.mjs"] = "// corrupted";
    await expect(updateAgent(test.options)).rejects.toThrow("integrity_failed");
    expect(await readFile(path.join(test.rootDir, "src/index.mjs"), "utf8")).toContain("old runtime");
  });
  it("rolls back changed and newly-created files after an activation failure", async () => {
    const test = await fixture();
    await expect(updateAgent({ ...test.options, beforeActivate: (file: string) => { if (file === "package.json") throw new Error("fixture disk failure"); } })).rejects.toThrow("fixture disk failure");
    expect(await readFile(path.join(test.rootDir, "src/index.mjs"), "utf8")).toContain("old runtime");
    expect(await readFile(path.join(test.rootDir, "package.json"), "utf8")).toContain("0.7.3");
    await expect(readFile(path.join(test.rootDir, "src/diagnostics.mjs"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("recovers an interrupted transaction before attempting another download", async () => {
    const test = await fixture();
    await mkdir(path.join(test.rootDir, ".update-backup/src"), { recursive: true });
    await writeFile(path.join(test.rootDir, ".update-backup/src/index.mjs"), "// restored\n");
    await writeFile(path.join(test.rootDir, "src/index.mjs"), "// mixed release\n");
    await writeFile(path.join(test.rootDir, ".update-transaction.json"), JSON.stringify([{ file: "src/index.mjs", existed: true }]));
    test.fetcher.mockRejectedValue(new Error("offline"));
    await expect(updateAgent(test.options)).rejects.toThrow("offline");
    expect(await readFile(path.join(test.rootDir, "src/index.mjs"), "utf8")).toContain("restored");
  });
  it("does not overwrite a newer installed release", async () => {
    const test = await fixture(); await writeFile(path.join(test.rootDir, "package.json"), '{"version":"0.9.0"}');
    expect(await updateAgent(test.options)).toEqual({ status: "current" }); expect(test.fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects path traversal and missing runtime dependencies", async () => {
    const test = await fixture(); test.manifest.files.push("../run.cmd");
    await expect(updateAgent(test.options)).rejects.toThrow("invalid_manifest");
    test.manifest.files.pop(); test.manifest.files = test.manifest.files.filter(file => file !== "src/diagnostics.mjs");
    await expect(updateAgent(test.options)).rejects.toThrow("missing_dependency");
  });
  it("does not run two updater instances concurrently", async () => {
    const test = await fixture(); await writeFile(path.join(test.rootDir, ".update-lock"), String(process.pid));
    expect(await updateAgent(test.options)).toEqual({ status: "busy" }); expect(test.fetcher).not.toHaveBeenCalled();
  });
});
