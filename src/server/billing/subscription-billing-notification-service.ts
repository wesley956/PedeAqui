import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

async function systemActor() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("active", true)
    .eq("role", "super_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No active platform super_admin available for billing notification audit");
  return data.user_id;
}

function content(kind: string, amountCents: number | null, dueAt: string | null) {
  const amount = amountCents === null ? null : money(amountCents);
  const due = dueAt ? date(dueAt) : null;
  switch (kind) {
    case "due_soon":
      return { title: "Mensalidade PedeAqui próxima do vencimento", body: `Sua mensalidade${amount ? ` de ${amount}` : ""}${due ? ` vence em ${due}` : ""}. A cobrança PIX já está disponível no painel.` };
    case "due_today":
      return { title: "Mensalidade PedeAqui vence hoje", body: `Sua mensalidade${amount ? ` de ${amount}` : ""} vence hoje${due ? ` (${due})` : ""}. Consulte a cobrança PIX no painel para manter o serviço regular.` };
    case "overdue":
      return { title: "Mensalidade PedeAqui em atraso", body: `Sua mensalidade${amount ? ` de ${amount}` : ""}${due ? `, vencida em ${due}` : ""}, está em atraso. Regularize pelo PIX disponível no painel para evitar a suspensão após o período de tolerância.` };
    case "suspended":
      return { title: "Acesso PedeAqui suspenso", body: "O acesso operacional foi suspenso após o encerramento do período de tolerância sem confirmação de pagamento. Regularize a mensalidade para reativação." };
    case "reactivated":
      return { title: "Acesso PedeAqui reativado", body: "O pagamento foi confirmado e o acesso operacional do PedeAqui foi reativado." };
    default:
      return { title: "Aviso de mensalidade PedeAqui", body: "Há uma atualização sobre a mensalidade da sua conta PedeAqui." };
  }
}

export class SubscriptionBillingNotificationService {
  static async dispatchPanel(now = new Date()) {
    const admin = createAdminClient();
    const actorUserId = await systemActor();
    const nowIso = now.toISOString();
    const result = { scanned: 0, sent: 0, cancelled: 0, skipped: 0, errors: [] as string[] };

    const { data: notices, error } = await admin
      .from("subscription_billing_notifications")
      .select("id,organization_id,subscription_id,invoice_id,kind,scheduled_at")
      .eq("channel", "panel")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    result.scanned = notices?.length ?? 0;

    for (const notice of notices ?? []) {
      try {
        let invoice: { total_amount_cents: number; due_at: string; status: string } | null = null;
        if (notice.invoice_id) {
          const invoiceQuery = await admin
            .from("subscription_invoices")
            .select("total_amount_cents,due_at,status")
            .eq("id", notice.invoice_id)
            .maybeSingle();
          if (invoiceQuery.error) throw invoiceQuery.error;
          invoice = invoiceQuery.data;
        }

        const staleForInvoice = invoice && (
          ["paid", "cancelled", "waived"].includes(invoice.status)
          || (invoice.status === "overdue" && ["due_soon", "due_today"].includes(notice.kind))
        );
        if (staleForInvoice) {
          const cancelled = await admin
            .from("subscription_billing_notifications")
            .update({ status: "cancelled", last_error: null, updated_at: nowIso })
            .eq("id", notice.id)
            .eq("status", "pending");
          if (cancelled.error) throw cancelled.error;
          result.cancelled += 1;
          continue;
        }

        const existing = await admin
          .from("platform_customer_messages")
          .select("id")
          .eq("organization_id", notice.organization_id)
          .eq("channel", "panel")
          .contains("metadata", { billing_notification_id: notice.id })
          .limit(1)
          .maybeSingle();
        if (existing.error) throw existing.error;

        if (!existing.data) {
          const message = content(notice.kind, invoice?.total_amount_cents ?? null, invoice?.due_at ?? null);
          const inserted = await admin.from("platform_customer_messages").insert({
            organization_id: notice.organization_id,
            channel: "panel",
            kind: `billing_${notice.kind}`,
            title: message.title,
            body: message.body,
            status: "sent",
            scheduled_at: notice.scheduled_at,
            sent_at: nowIso,
            last_error: null,
            metadata: {
              source: "subscription_billing",
              billing_notification_id: notice.id,
              subscription_id: notice.subscription_id,
              invoice_id: notice.invoice_id,
            },
            created_by: actorUserId,
            updated_by: actorUserId,
          });
          if (inserted.error) throw inserted.error;
        } else {
          result.skipped += 1;
        }

        const marked = await admin
          .from("subscription_billing_notifications")
          .update({ status: "sent", sent_at: nowIso, last_error: null, updated_at: nowIso })
          .eq("id", notice.id)
          .eq("status", "pending");
        if (marked.error) throw marked.error;
        result.sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown panel billing notification error";
        result.errors.push(message);
        await admin
          .from("subscription_billing_notifications")
          .update({ status: "failed", last_error: message, updated_at: nowIso })
          .eq("id", notice.id)
          .eq("status", "pending");
      }
    }

    return result;
  }
}
