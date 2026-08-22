import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playOrderAlertTone } from "@/features/orders/order-alert-tone";
import { friendlyOrderActionError } from "@/features/orders/order-action-error";

const read = (path: string) => readFileSync(path, "utf8");
const manager = read("src/features/orders/order-manager-board.tsx");
const actions = read("src/features/orders/actions.ts");
const detail = read("src/app/(app)/pedidos/[id]/page.tsx");
const publicRefresh = read("src/features/orders/public-order-refresh.tsx");
const realtime = read("src/features/orders/order-realtime.tsx");
const publicDetail = read("src/app/m/[slug]/pedido/[id]/page.tsx");

describe("presentation diagnostics 036–040", () => {
  it("requires a real user gesture for sound on every page load and keeps visual fallback", () => {
    expect(manager).toContain("new AudioContextCtor()");
    expect(manager).toContain("audioContextRef.current = context");
    expect(manager).toContain("alerta visual continuará ativo");
    expect(manager).not.toContain("localStorage");
  });

  it("plays the two-note alert through the context activated by the user", async () => {
    const starts: number[] = [];
    const stops: number[] = [];
    const frequencies: number[] = [];
    let resumes = 0;
    const gain = {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
    const context = {
      state: "suspended",
      currentTime: 10,
      destination: {},
      resume: async () => { resumes += 1; },
      createGain: () => gain,
      createOscillator: () => ({
        type: "sine",
        frequency: { set value(value: number) { frequencies.push(value); } },
        connect() {},
        start(value: number) { starts.push(value); },
        stop(value: number) { stops.push(value); },
      }),
    } as unknown as AudioContext;
    await playOrderAlertTone(context);
    expect(resumes).toBe(1);
    expect(frequencies).toEqual([660, 880]);
    expect(starts).toEqual([10, 10.18]);
    expect(stops).toEqual([10.22, 10.4]);
  });

  it("supports friendly accept, reject and cancel actions with pending feedback", () => {
    expect(actions).toContain('"accept", "reject", "cancel"');
    expect(actions).toContain('case "cancel": await OrderService.cancel');
    expect(detail).toContain('intent="accept"');
    expect(detail).toContain('intent="reject"');
    expect(detail).toContain('intent="cancel"');
    expect(read("src/features/orders/order-action-form.tsx")).toContain("Processando…");
    expect(actions).toContain("friendlyOrderActionError(error)");
  });

  it("turns known transition failures into actionable messages without leaking internals", () => {
    expect(friendlyOrderActionError(new Error("Reason is required"))).toContain("3 caracteres");
    expect(friendlyOrderActionError(new Error("Payment must be settled before the order can be completed"))).toContain("pagamento");
    expect(friendlyOrderActionError(new Error("Invalid order transition: confirmed -> confirmed"))).toContain("mudou de etapa");
    expect(friendlyOrderActionError(new Error("secret database detail"))).not.toContain("database");
  });

  it("keeps manager and detail pages live without manual reload", () => {
    expect(manager).toContain('event: "INSERT"');
    expect(manager).toContain('event: "UPDATE"');
    expect(realtime).toContain('{ event: "*", schema: "public", table: "orders"');
    expect(publicRefresh).toContain("window.setInterval(refreshIfVisible, intervalMs)");
    expect(publicRefresh).toContain('document.visibilityState === "visible"');
  });

  it("uses customer-facing channel and fulfillment labels in the order detail", () => {
    expect(detail).toContain('"Cardápio"');
    expect(detail).toContain('"Salão"');
    expect(detail).toContain('includes(order.fulfillment_type) ? "Mesa"');
  });

  it("formats public update timestamps in the store timezone", () => {
    expect(publicDetail).toContain('timeZone: store.timezone || "America/Sao_Paulo"');
  });

  it("permits completion for every settled payment state supported by the domain", () => {
    expect(detail).toContain('["paid", "partially_refunded", "refunded"].includes(order.payment_status)');
  });
});
