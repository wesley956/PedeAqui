"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";

export type GenerateSubscriptionPixState = {
  status: "idle" | "success" | "error";
  message: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result(status: GenerateSubscriptionPixState["status"], message: string): GenerateSubscriptionPixState {
  return { status, message };
}

export async function generateSubscriptionPixAction(
  _previousState: GenerateSubscriptionPixState,
  formData: FormData,
): Promise<GenerateSubscriptionPixState> {
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!UUID_PATTERN.test(invoiceId)) return result("error", "Mensalidade inválida.");

  try {
    const access = await NavigationAccessService.load();
    if (!access.permissionKeys.includes(PERMISSIONS.SUBSCRIPTION_VIEW)) {
      return result("error", "Você não tem permissão para acessar a cobrança desta empresa.");
    }

    const configuration = await SubscriptionPixBillingService.configuration();
    if (!configuration.billingEnabled) {
      return result("error", "A cobrança PIX do PedeAqui está temporariamente pausada.");
    }

    const admin = createAdminClient();
    const { data: invoice, error: invoiceError } = await admin
      .from("subscription_invoices")
      .select("id,organization_id,subscription_id,base_amount_cents,total_amount_cents,currency,due_at,status")
      .eq("id", invoiceId)
      .eq("organization_id", access.context.organizationId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return result("error", "Mensalidade não encontrada para esta empresa.");
    if (!["pending", "overdue"].includes(invoice.status)) {
      return result("error", invoice.status === "paid" ? "Esta mensalidade já está paga." : "Esta mensalidade não aceita uma nova cobrança PIX.");
    }

    const { data: existingCharge, error: chargeError } = await admin
      .from("subscription_pix_charges")
      .select("id,status,expires_at")
      .eq("invoice_id", invoice.id)
      .in("status", ["pending", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (chargeError) throw chargeError;

    if (existingCharge?.status === "paid") {
      revalidatePath("/assinatura");
      return result("success", "Pagamento já confirmado para esta mensalidade.");
    }

    if (existingCharge?.status === "pending") {
      const expiresAt = existingCharge.expires_at ? Date.parse(existingCharge.expires_at) : Number.POSITIVE_INFINITY;
      if (expiresAt > Date.now()) {
        revalidatePath("/assinatura");
        return result("success", "O PIX atual ainda está válido e foi mantido para evitar cobrança duplicada.");
      }

      const reconciliation = await SubscriptionPixBillingService.reconcileCharge(existingCharge.id, access.context.userId);
      if (reconciliation.status === "paid") {
        revalidatePath("/assinatura");
        return result("success", "Pagamento confirmado pelo Mercado Pago.");
      }
      if (reconciliation.status === "pending") {
        revalidatePath("/assinatura");
        return result("success", "O Mercado Pago ainda considera o PIX atual pendente; ele foi mantido para evitar duplicidade.");
      }
    }

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("email")
      .eq("id", access.context.organizationId)
      .single();
    if (organizationError) throw organizationError;
    const payerEmail = organization.email?.trim();
    if (!payerEmail) return result("error", "Cadastre um e-mail da empresa antes de gerar o PIX.");

    const amountCents = invoice.total_amount_cents ?? invoice.base_amount_cents;
    if (!Number.isInteger(amountCents) || amountCents < 1 || invoice.currency !== "BRL") {
      return result("error", "O valor desta mensalidade não está disponível para cobrança PIX.");
    }

    await SubscriptionPixBillingService.createCharge({
      organizationId: access.context.organizationId,
      subscriptionId: invoice.subscription_id,
      invoiceId: invoice.id,
      amountCents,
      payerEmail,
      actorUserId: access.context.userId,
    });

    revalidatePath("/assinatura");
    return result("success", "Novo PIX gerado. O QR Code já está disponível abaixo.");
  } catch {
    return result("error", "Não foi possível gerar o PIX agora. Tente novamente; nenhuma cobrança duplicada será criada.");
  }
}
