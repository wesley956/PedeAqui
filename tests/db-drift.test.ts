import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Baseline = { migrations: [string, string][] };
const root = process.cwd();
const script = path.join(root, "scripts/check-db-drift.mjs");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "supabase/production-migrations.json"), "utf8")) as Baseline;

function writeRemote(entries: [string, string][]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pedeaqui-drift-"));
  const file = path.join(dir, "remote.txt");
  fs.writeFileSync(file, `${entries.map(([version, name]) => `${version}|${name}`).join("\n")}\n`);
  return file;
}

function run(remote: [string, string][]) {
  return spawnSync(process.execPath, [script, "--remote-file", writeRemote(remote)], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("database drift checker", () => {
  it("accepts the reconciled baseline", () => {
    const output = execFileSync(process.execPath, [script, "--remote-file", writeRemote(baseline.migrations)], {
      cwd: root,
      encoding: "utf8",
    });
    expect(output).toContain("remoto confere");
  });

  it("detects a migration present remotely but absent from the Git baseline", () => {
    const result = run([...baseline.migrations, ["20260814010101", "controlled_remote_only"]]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("existe no remoto e falta no baseline Git");
    expect(result.stderr).not.toContain("SUPABASE_DB_URL");
  });

  it("detects a divergent migration name without exposing credentials", () => {
    const changed = baseline.migrations.map((entry) => [...entry] as [string, string]);
    changed[changed.length - 1][1] = "controlled_wrong_name";
    const result = run(changed);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Divergência na posição");
    expect(result.stderr).not.toMatch(/postgres(?:ql)?:\/\//i);
  });
});
