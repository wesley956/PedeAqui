import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playOrderAlertTone } from "@/features/orders/order-alert-tone";
import { friendlyOrderActionError } from "@/features/orders/order-action-error";

const read = (path: string) => readFileSync(path, "utf8");
const manager = read("src/features/orders/order-manager-board.tsx");
const customManager = read("src/features/orders/custom-order-workflow-board.tsx");
const soundAlert = read("src/features/orders/use-order-alert.tsx");
const actions = read("src/features/orders/actions.ts");
const detail = read("src/app/(app)/pedidos/[id]/page.tsx");
const publicRefresh = read("src/features/orders/public-order-refresh.tsx");
const realtime = read("src/features/orders/order-realtime.tsx");
const operationalRealtime = read("src/features/operations/use-operational-realtime.tsx");
const publicDetail = read("src/app/m/[slug]/pedido/[id]/page.tsx");

describe("presentation diagnostics 036–040", () => {
  it("persists the sound choice while exposing blocked playback instead of a false active state", () => {
    expect(soundAlert).toContain("createOrderAlertAudio()");
    expect(soundAlert).toContain("readOrderAlertPreference()");
    expect(soundAlert).toContain("writeOrderAlertPreference(true)");
    expect(soundAlert).toContain('"needs_activation"');
    expect(soundAlert).toContain('"Liberar som"');
    expect(manager).toContain("useOrderAlert(setNotice)");
    expect(manager).toContain("Testar som");
    expect(customManager).toContain("useOrderAlert(setNotice)");
    expect(customManager).toContain("Testar som");
    expect(manager).not.toContain("o som continua ativado");
  });

  it("restarts the voice alert at full volume", async () => {
    let pauses = 0;
    let plays = 0;
    const audio = {
      currentTime: 12,
      muted: true,
      volume: 0.2,
      pause() { pauses += 1; },
      async play() { plays += 1; },
    } as unknown as HTMLAudioElement;

    await playOrderAlertTone(audio);

    expect(pauses).toBe(1);
    expect(plays).toBe(1);
    expect(audio.currentTime).toBe(0);
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(1);
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
    expect(manager).toContain("useOperationalRealtime");
    expect(customManager).toContain("useOperationalRealtime");
    expect(operationalRealtime).toContain('{ event: "*", schema: "public", table: "orders"');
    expect(operationalRealtime).toContain("applyOperationalRowEvent");
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
