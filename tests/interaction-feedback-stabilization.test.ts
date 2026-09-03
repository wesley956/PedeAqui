import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyFailure } from "@/server/observability/failure-classification";

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

  it.each([
    [{ status: 422 }, "validation", false, "Revise os dados informados e tente novamente."],
    [{ name: "TimeoutError" }, "timeout", true, "O serviço demorou mais que o esperado. Tente novamente em instantes."],
    [{ name: "FetchError" }, "dependency", true, "Um serviço necessário está indisponível no momento. Tente novamente em instantes."],
    [new Error("unexpected implementation detail"), "internal", false, "Não foi possível concluir a operação. Tente novamente."],
  ] as const)("classifies validation, timeout, dependency and unexpected failures for the operator", (error, kind, retryable, userMessage) => {
    expect(classifyFailure(error)).toEqual({ kind, retryable, userMessage });
  });

  it("keeps technical failure classification in server logs while exposing only friendly fallback text", () => {
    const actions = read("src/features/delivery/actions.ts");
    expect(actions).toContain("classifyFailure(error).userMessage");
    expect(actions).toContain('logger.error("delivery_action_failed"');
    expect(actions).toContain("failureKind: classification.kind");
    expect(actions).toContain("failureCode: failureCode(error)");
    expect(actions).toContain("retryable: classification.retryable");
    expect(actions).not.toContain("return raw;");
  });
});
