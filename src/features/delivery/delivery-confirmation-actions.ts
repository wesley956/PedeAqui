"use server";

import { revalidatePath } from "next/cache";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { DriverDeliveryConfirmationService } from "@/server/delivery/driver-delivery-confirmation-service";
import type { DeliveryActionState } from "@/features/delivery/actions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message : "Não foi possível confirmar a entrega.";
  const lower = raw.toLocaleLowerCase("pt-BR");
  if (lower.includes("payment exception note")) return "Informe o que aconteceu com o pagamento.";
  if (lower.includes("no pending payment")) return "Não existe um pagamento pendente válido para confirmar nesta entrega.";
  if (lower.includes("multiple pending payments")) return "Este pedido tem mais de um pagamento pendente. A baixa precisa ser resolvida no painel.";
  if (lower.includes("not assigned to current driver")) return "Esta entrega não está atribuída ao seu usuário.";
  if (lower.includes("out for delivery")) return "Inicie a rota antes de confirmar a entrega.";
  return raw;
}

function refresh() {
  revalidatePath("/entregas");
  revalidatePath("/entregador");
  revalidatePath("/pedidos");
  revalidatePath("/pedidos/historico");
}

export async function confirmDeliveryWithPaymentAction(
  _previous: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const paymentReceived = text(formData, "paymentOutcome") !== "not_received";
  try {
    const result = await DriverDeliveryConfirmationService.confirm(
      text(formData, "deliveryId"),
      {
        paymentReceived,
        paymentNote: text(formData, "paymentNote") || null,
      },
      text(formData, "idempotencyKey"),
    );

    scheduleOrderWhatsAppNotifications("delivery.delivered");
    if (result.payment_confirmed) scheduleOrderWhatsAppNotifications("payment.paid");
    refresh();

    return paymentReceived
      ? { ok: true, message: result.payment_confirmed ? "Entrega e pagamento confirmados." : "Entrega confirmada.", error: null }
      : { ok: true, message: "Entrega confirmada. Pagamento ficou pendente e a observação foi registrada.", error: null };
  } catch (error) {
    refresh();
    return { ok: false, message: null, error: friendly(error) };
  }
}
