import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/(app)/entregador/page.tsx"), "utf8");
const service = readFileSync(join(process.cwd(), "src/server/delivery/delivery-operations-service.ts"), "utf8");
const realtime = readFileSync(join(process.cwd(), "src/features/delivery/delivery-realtime.tsx"), "utf8");
const forms = readFileSync(join(process.cwd(), "src/features/delivery/operation-forms.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/delivery/courier.module.css"), "utf8");

describe("courier mobile journey", () => {
  it("loads only deliveries bound to the current driver and active store", () => {
    expect(service).toContain('.eq("store_id", storeId).eq("driver_id", driver.id)');
    expect(service).toContain('.eq("user_id", context.userId)');
    expect(page).toContain('item.order.fulfillment_status !== "delivered"');
  });

  it("shows the complete operational information needed on the street", () => {
    for (const text of ["O que levar", "Pagamento", "Destino", "Abrir rota", "WhatsApp do cliente", "Ligar para cliente", "Próxima ação", "Histórico recente", "DeliverySla"]) expect(page).toContain(text);
    for (const field of ["total_cents", "payment_status", "payment_method_snapshot", "cash_change_for_cents", "product_name_snapshot", "line_total_cents"]) expect(service).toContain(field);
    expect(page).toContain("Aguardando retirada na loja");
    expect(page).not.toContain("Aguardando retirada no restaurante");
  });

  it("keeps the existing linear delivery transitions", () => {
    for (const intent of ["picked_up", "out_for_delivery", "delivered"]) expect(page).toContain(`intent=\"${intent}\"`);
    expect(forms).toContain("prominent?: boolean");
  });

  it("exposes connection and action error states", () => {
    expect(page).toContain("showStatus");
    expect(realtime).toContain("CHANNEL_ERROR");
    expect(realtime).toContain("Sem atualização ao vivo");
    expect(forms).toContain('data-tone="danger"');
  });

  it("uses large responsive touch actions", () => {
    expect(css).toContain("min-height:60px");
    expect(css).toContain("@media(max-width:520px)");
    expect(css).toContain("@media(pointer:coarse)");
  });
});
