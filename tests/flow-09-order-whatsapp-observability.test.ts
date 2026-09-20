import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyOrderNotificationFailure,
  maskWhatsAppRecipient,
  notificationDeliveryLabel,
  orderNotificationFailureLabel,
} from "@/server/platform/order-whatsapp-diagnostic";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const service = read("src/server/platform/platform-order-diagnostic-service.ts");
const page = read("src/app/platform/operacao/pedidos/[orderId]/page.tsx");

describe("FLOW-09 order WhatsApp observability", () => {
  it("classifies actionable failure boundaries", () => {
    expect(classifyOrderNotificationFailure("customer_phone_conflict")).toBe("identity");
    expect(classifyOrderNotificationFailure("whatsapp_not_configured")).toBe("configuration");
    expect(classifyOrderNotificationFailure("template_required")).toBe("meta_window_template");
    expect(classifyOrderNotificationFailure("provider_131026")).toBe("provider");
    expect(classifyOrderNotificationFailure("whatsapp_temporarily_unavailable")).toBe("transient");
    expect(classifyOrderNotificationFailure("authoritative_event_missing")).toBe("integrity");
    expect(classifyOrderNotificationFailure("workflow_stage_hidden")).toBe("workflow");
    expect(orderNotificationFailureLabel("template_required")).toBe("Janela/modelo da Meta");
  });

  it("never exposes a complete recipient", () => {
    expect(maskWhatsAppRecipient("+55 (19) 99999-1234")).toBe("••••1234");
    expect(maskWhatsAppRecipient(null)).toBeNull();
  });

  it("distinguishes queue state from provider delivery", () => {
    expect(notificationDeliveryLabel({ queueStatus: "sent", providerStatus: "sent" })).toBe("Aceita pela Meta");
    expect(notificationDeliveryLabel({ queueStatus: "sent", providerStatus: "delivered" })).toBe("Entregue ao cliente");
    expect(notificationDeliveryLabel({ queueStatus: "sent", providerStatus: "read" })).toBe("Lida pelo cliente");
    expect(notificationDeliveryLabel({ queueStatus: "failed" })).toBe("Aguardando nova tentativa");
  });

  it("reconstructs the durable chain inside the exact order tenant", () => {
    for (const table of ["order_whatsapp_notifications", "messages", "conversations", "contacts", "checkout_sessions"]) {
      expect(service).toContain(`from("${table}")`);
    }
    expect(service).toContain('.eq("organization_id",order.organization_id)');
    expect(service).toContain('.eq("store_id",order.store_id)');
    expect(service).toContain("domain_event_id");
    expect(service).toContain("message_id");
    expect(service).toContain("external_message_id");
    expect(service).toContain("whatsapp_repeated_failure");
  });

  it("renders identifiers, retries and provider outcome without message body or secrets", () => {
    expect(page).toContain("Pedido → Evento → Fila → WhatsApp → Entrega");
    expect(page).toContain("Próxima tentativa");
    expect(page).toContain("Destinatário protegido");
    expect(service).not.toContain('.select("body');
    expect(service).not.toContain("tracking_access_token");
    expect(service).not.toContain("customer_phone_snapshot");
  });
});
