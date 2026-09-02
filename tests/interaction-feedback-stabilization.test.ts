import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("stabilization #826 interaction feedback contracts", () => {
  it("prevents duplicate form submission while an action is pending", () => {
    const button = read("src/components/ui/button.tsx");
    expect(button).toContain("useFormStatus()");
    expect(button).toContain('props.type === "submit" && formStatus.pending');
    expect(button).toContain("const isDisabled = disabled || isLoading");
    expect(button).toContain("disabled={isDisabled}");
    expect(button).toContain("aria-busy={isLoading || undefined}");
    expect(button).toContain('loadingLabel ?? "Processando…"');
  });

  it("exposes loading, empty, error and success as explicit accessible states", () => {
    const feedback = read("src/components/ui/feedback.tsx");
    expect(feedback).toContain("export function EmptyState");
    expect(feedback).toContain("export function LoadingState");
    expect(feedback).toContain("export function ErrorState");
    expect(feedback).toContain("export function SuccessState");
    expect(feedback).toContain('role="status" aria-live="polite"');
    expect(feedback).toContain('role="alert"');
  });

  it("supports actionable recovery instead of toast-only feedback", () => {
    const feedback = read("src/components/ui/feedback.tsx");
    expect(feedback).toContain("action?: ReactNode");
    expect(feedback).toContain("{action ? <div className={styles.actions}>{action}</div> : null}");
    expect(feedback).toContain("function StateBlock");
    expect(feedback).toContain("{action}");
  });

  it("keeps destructive confirmation explicit and busy-aware", () => {
    const feedback = read("src/components/ui/feedback.tsx");
    expect(feedback).toContain("export function ConfirmDialog");
    expect(feedback).toContain('tone={destructive ? "danger" : "primary"}');
    expect(feedback).toContain("loading={loading}");
    expect(feedback).toContain("onClick={onConfirm}");
    expect(feedback).toContain("onClick={onClose}");
  });
});
