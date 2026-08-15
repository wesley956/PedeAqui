"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import { paymentMethodSchema } from "@/server/checkout/schemas";
import { parseMoneyToCents } from "@/server/catalog/money";
import { PaymentService } from "@/server/payments/payment-service";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";

export async function savePaymentMethodsAction(formData: FormData) {
  const methods = formData.getAll("method").map((value) => paymentMethodSchema.parse(String(value)));
  await StorePaymentMethodService.save(methods);
  revalidatePath("/configuracoes/pagamentos");
  revalidatePath("/m/[slug]/checkout", "page");
}

const onlinePixConfigSchema = z.object({
  environment: z.enum(["test", "production"]),
  accessToken: z.string().trim().max(500).optional(),
  webhookSecret: z.string().trim().max(500).optional(),
});

export async function saveOnlinePixProviderAction(formData: FormData) {
  const input = onlinePixConfigSchema.parse({
    environment: String(formData.get("environment") ?? "production"),
    accessToken: String(formData.get("accessToken") ?? ""),
    webhookSecret: String(formData.get("webhookSecret") ?? ""),
  });
  await OrderPaymentProviderConfigService.configureCurrentStore({
    enabled: formData.get("enabled") === "on",
    environment: input.environment,
    accessToken: input.accessToken || null,
    webhookSecret: input.webhookSecret || null,
  });
  revalidatePath("/configuracoes/pagamentos");
  revalidatePath("/m/[slug]/checkout", "page");
}

const intentSchema = z.enum(["confirm", "fail", "refund"]);

export type PaymentActionState = {
  ok: boolean;
  message: string | null;
  error: string | null;
};

function refresh(orderId: string) {
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/caixa");
}

function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message.toLocaleLowerCase("pt-BR") : "";
  if (raw.includes("open cash session required for cash payment")) return "Abra o caixa antes de movimentar um pagamento em dinheiro.";
  if (raw.includes("cash outflow exceeds expected balance")) return "O caixa aberto não possui saldo físico esperado suficiente para este estorno.";
  return error instanceof Error ? error.message : "Não foi possível atualizar o pagamento.";
}

export async function paymentAction(
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const intent = intentSchema.safeParse(String(formData.get("intent") ?? ""));
  if (!intent.success) return { ok: false, message: null, error: "Ação de pagamento inválida." };

  try {
    if (intent.data === "confirm") {
      const cashRaw = String(formData.get("cashReceived") ?? "").trim();
      const reference = String(formData.get("reference") ?? "").trim() || null;
      await PaymentService.confirm(paymentId, {
        cashReceivedCents: cashRaw ? parseMoneyToCents(cashRaw) : null,
        reference,
      });
      refresh(orderId);
      return { ok: true, message: "Pagamento confirmado.", error: null };
    }

    const reason = String(formData.get("reason") ?? "");
    if (intent.data === "refund") {
      await PaymentService.refund(paymentId, reason);
      refresh(orderId);
      return { ok: true, message: "Pagamento estornado com movimento compensatório.", error: null };
    }

    await PaymentService.fail(paymentId, reason);
    refresh(orderId);
    return { ok: true, message: "Tentativa de pagamento marcada como falha.", error: null };
  } catch (error) {
    return { ok: false, message: null, error: friendly(error) };
  }
}
