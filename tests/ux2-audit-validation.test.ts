import { describe, expect, it } from "vitest";
import { auditFailures, requireLocalTarget } from "../scripts/ux2-auditoria/validation.mjs";

describe("UX2 audit release gate", () => {
  it("accepts successful evidence", () => {
    expect(auditFailures([{ status: 200, vw: 360, docWidth: 360, clipped: [], consoleErrors: [], axe: [] }, { area: "fluxo", ok: true }])).toEqual([]);
  });
  it.each([
    { status: 500 }, { status: 404 }, { error: "login failed" }, { ok: false },
    { consoleErrors: ["hydration failed"] }, { vw: 360, docWidth: 400 },
    { clipped: ["Salvar"] }, { axe: null }, { axe: [{ impact: "critical" }] },
  ])("rejects failed evidence: %j", (entry) => {
    expect(auditFailures([entry])).toHaveLength(1);
  });
  it("rejects an empty run", () => expect(auditFailures([])).toHaveLength(1));
  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])("accepts loopback %s", (url) => {
    expect(() => requireLocalTarget(url)).not.toThrow();
  });
  it.each([undefined, "https://pedeaqui.pp.ua", "http://localhost.example.com", "http://user:secret@localhost:3000"])("rejects unsafe target %s", (url) => {
    expect(() => requireLocalTarget(url)).toThrow();
  });
});
