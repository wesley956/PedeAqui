import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function relativeLuminance(hex: string) {
  const channels = hex.replace("#", "").match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [r = 0, g = 0, b = 0] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("PedeAqui shared component accessibility", () => {
  it("keeps normal action text at WCAG AA contrast on primary, hover and danger fills", () => {
    expect(contrast("#171a1c", "#ff6b00")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#171a1c", "#ff4a00")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#171a1c", "#ef4444")).toBeGreaterThanOrEqual(4.5);
    expect(read("src/app/globals.css")).toContain("--text-on-brand: var(--brand-graphite-deep)");
  });

  it("keeps operational state text at WCAG AA contrast on tonal surfaces", () => {
    const pairs = [
      ["#86efac", "#13281a"],
      ["#ffc35c", "#2c2519"],
      ["#ff8a80", "#2b1c1c"],
      ["#7dd3fc", "#132735"],
    ] as const;
    for (const [foreground, background] of pairs) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves visible focus, touch targets and reduced motion for buttons and choices", () => {
    const button = read("src/components/ui/button.module.css");
    const forms = read("src/components/ui/form-controls.module.css");
    expect(button).toContain(":focus-visible");
    expect(button).toContain("@media (pointer: coarse)");
    expect(button).toContain("var(--control-height-lg)");
    expect(button).toContain("@media (prefers-reduced-motion: reduce)");
    expect(forms).toContain(".control:focus-visible");
    expect(forms).toContain(".switchInput:focus-visible + .switch");
    expect(forms).toContain("@media (pointer: coarse)");
  });

  it("keeps form names, validation and switch semantics available without a mouse", () => {
    const forms = read("src/components/ui/form-controls.tsx");
    expect(forms).toContain("htmlFor={id}");
    expect(forms).toContain("aria-invalid");
    expect(forms).toContain("aria-describedby");
    expect(forms).toContain('role="alert"');
    expect(forms).toContain('role="switch"');
  });

  it("uses unique dialog relationships and keyboard-native cancellation", () => {
    const feedback = read("src/components/ui/feedback.tsx");
    const feedbackCss = read("src/components/ui/feedback.module.css");
    expect(feedback).toContain("useId()");
    expect(feedback).toContain("aria-labelledby={titleId}");
    expect(feedback).toContain("aria-describedby={description ? descriptionId : undefined}");
    expect(feedback).toContain("showModal()");
    expect(feedback).toContain('addEventListener("cancel"');
    expect(feedbackCss).toContain("@media (pointer: coarse)");
    expect(feedbackCss).toContain("min-width: var(--control-height-lg)");
    expect(feedbackCss).toContain("@media (forced-colors: active)");
  });

  it("keeps list and status information semantic instead of color-only", () => {
    const lists = read("src/components/ui/data-list.tsx");
    const status = read("src/components/ui/status.tsx");
    const statusCss = read("src/components/ui/status.module.css");
    expect(lists).toContain("<caption");
    expect(lists).toContain('scope="col"');
    expect(lists).toContain('role="list"');
    expect(status).toContain("definition.icon");
    expect(status).toContain("visibleLabel");
    expect(status).toContain("aria-label={visibleLabel}");
    expect(statusCss).toContain("@media (forced-colors: active)");
  });

  it("does not remove focus outlines from shared UI styles", () => {
    const styles = [
      "src/components/ui/button.module.css",
      "src/components/ui/form-controls.module.css",
      "src/components/ui/feedback.module.css",
      "src/components/ui/data-list.module.css",
      "src/components/ui/status.module.css",
    ].map(read).join("\n");
    expect(styles).not.toMatch(/outline\s*:\s*(?:none|0)\b/i);
  });
});
