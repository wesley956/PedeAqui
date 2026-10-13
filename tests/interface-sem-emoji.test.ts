import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B50}]/u;

function tsxFiles(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) tsxFiles(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("ícones da interface", () => {
  it("usa ícones de traço, nunca emoji, nas telas", () => {
    const offenders = tsxFiles("src").filter((file) => EMOJI.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
