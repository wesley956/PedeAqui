import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";
import {
  projectExternalFinance,
  summarizeExternalChannels,
  type ExternalFinanceRow,
} from "@/server/finance/external-channel-finance";
import { resolveExternalPaymentPolicy } from "@/server/payments/external-payment-policy";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const relationChunkSize = 100;

function permission(value: string) {
  return value as PermissionKey;
}

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}

async function can(key: string, context: Awaited<ReturnType<typeof authorize>>) {
  try {
    await authorize(permission(key), context);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

function dateParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: map.year!, month: map.month!, day: map.day! };
}

function localDateKey(timeZone: string, instant: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function period(timeZone: string, input?: { from?: string | null; to?: string | null }) {
  const now = dateParts(timeZone);
  const from = input?.from ? dateText.parse(input.from) : `${now.year}-${now.month}-01`;
  const to = input?.to ? dateText.parse(input.to) : `${now.year}-${now.month}-${now.day}`;
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || a > b || (b.getTime() - a.getTime()) / 86_400_000 > 400) {
    throw new Error("Período financeiro inválido");
  }
  return { from, to, today: `${now.year}-${now.month}-${now.day}` };
}

function chunks<T>(values: readonly T[], size = relationChunkSize) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export class FinanceReadService {
  static async load(input?: { from?: string | null; to?: string | null }) {
    const context = await authorize(permission("finance.view"));
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();

    const storeResult = await admin.from("stores")
      .select("id,name,timezone")
      .eq("id", storeId)
      .eq("organization_id", context.organizationId)
      .single();
    if (storeResult.error) throw storeResult.error;

    const timeZone = storeResult.data.timezone || "America/Sao_Paulo";
    const selectedPeriod = period(timeZone, input);
    const [canManage, canSettle, canReports] = await Promise.all([
      can("finance.manage", context),
      can("finance.settle", context),
      can("finance.reports", context),
    ]);

    const [
      accountsResult,
      balancesResult,
      categoriesResult,
      obligationsResult,
      transactionsResult,
      suppliersResult,
      supplierStoresResult,
    ] = await Promise.all([
      admin.from("financial_accounts").select("id,name,account_type,system_key,active").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("financial_account_balances").select("account_id,balance_cents,updated_at").eq("organization_id", context.organizationId),
      admin.from("financial_categories").select("id,parent_id,name,nature,dre_group,system_key,active").eq("organization_id", context.organizationId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("financial_obligations").select("id,direction,obligation_type,source_type,source_id,counterparty_type,counterparty_id,description,competence_date,due_date,principal_cents,settled_cents,open_cents,status,cancelled_reason,created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).order("due_date", { ascending: true }).limit(180),
      admin.from("financial_transactions").select("id,obligation_id,account_id,category_id,transaction_type,direction,effect_sign,amount_cents,competence_date,source_type,source_id,transfer_group_id,description,metadata,occurred_at").eq("organization_id", context.organizationId).eq("store_id", storeId).order("occurred_at", { ascending: false }).limit(180),
      admin.from("suppliers").select("id,name").eq("organization_id", context.organizationId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("supplier_stores").select("supplier_id,active,payment_term_days").eq("organization_id", context.organizationId).eq("store_id", storeId),
    ]);
    for (const result of [accountsResult, balancesResult, categoriesResult, obligationsResult, transactionsResult, suppliersResult, supplierStoresResult]) {
      if (result.error) throw result.error;
    }

    const balanceMap = new Map((balancesResult.data ?? []).map((row) => [row.account_id, row]));
    const accounts = (accountsResult.data ?? []).map((account) => ({
      ...account,
      balance_cents: balanceMap.get(account.id)?.balance_cents ?? 0,
    }));
    const supplierConfigMap = new Map((supplierStoresResult.data ?? []).map((row) => [row.supplier_id, row]));
    const suppliers = (suppliersResult.data ?? []).map((supplier) => ({
      ...supplier,
      config: supplierConfigMap.get(supplier.id) ?? null,
    }));

    let report: unknown = null;
    if (canReports) {
      const reportResult = await admin.rpc("financial_report_internal", {
        p_store_id: storeId,
        p_from: selectedPeriod.from,
        p_to: selectedPeriod.to,
      });
      if (reportResult.error) throw reportResult.error;
      report = reportResult.data;
    }

    const pendingDeliveryPaymentsResult = await admin.from("orders")
      .select("id,display_number,channel,customer_name_snapshot,total_cents,payment_method_snapshot,updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("order_status", "confirmed")
      .eq("fulfillment_status", "delivered")
      .in("payment_status", ["pending", "authorized", "failed"])
      .order("updated_at", { ascending: true })
      .limit(100);
    if (pendingDeliveryPaymentsResult.error) throw pendingDeliveryPaymentsResult.error;

    const pendingRows = pendingDeliveryPaymentsResult.data ?? [];
    const pendingIds = pendingRows.map((row) => row.id);
    const externalPaymentsResult = pendingIds.length
      ? await admin.from("external_orders")
        .select("order_id,provider,payment_owner")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .in("order_id", pendingIds)
      : { data: [], error: null };
    if (externalPaymentsResult.error) throw externalPaymentsResult.error;
    const externalPaymentByOrder = new Map((externalPaymentsResult.data ?? []).map((row) => [row.order_id, row]));
    const pendingDeliveryPayments = pendingRows
      .filter((row) => resolveExternalPaymentPolicy(externalPaymentByOrder.get(row.id)).allowsInternalMutation)
      .map((row) => ({ ...row, external_payment: externalPaymentByOrder.get(row.id) ?? null }));

    // Fetch a deliberately broad UTC window, then apply the store timezone in
    // memory. This avoids period-boundary drift without adding a new SQL RPC.
    const broadFrom = new Date(`${selectedPeriod.from}T00:00:00Z`);
    broadFrom.setUTCDate(broadFrom.getUTCDate() - 1);
    const broadTo = new Date(`${selectedPeriod.to}T00:00:00Z`);
    broadTo.setUTCDate(broadTo.getUTCDate() + 2);

    const periodOrders: Array<{ id: string; created_at: string }> = [];
    for (let from = 0; ; from += 500) {
      const orderResult = await admin.from("orders")
        .select("id,created_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .gte("created_at", broadFrom.toISOString())
        .lt("created_at", broadTo.toISOString())
        .order("created_at", { ascending: true })
        .range(from, from + 499);
      if (orderResult.error) throw orderResult.error;
      const page = orderResult.data ?? [];
      periodOrders.push(...page.filter((row) => {
        const key = localDateKey(timeZone, row.created_at);
        return key >= selectedPeriod.from && key <= selectedPeriod.to;
      }));
      if (page.length < 500) break;
    }

    const periodOrderIds = periodOrders.map((row) => row.id);
    const externalFinanceResults = await Promise.all(chunks(periodOrderIds).map((ids) => admin.from("external_orders")
      .select("order_id,provider,payment_owner,last_snapshot")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_id", ids)));
    for (const result of externalFinanceResults) if (result.error) throw result.error;
    const externalFinanceOrders = externalFinanceResults
      .flatMap((result) => (result.data ?? []) as ExternalFinanceRow[])
      .map(projectExternalFinance)
      .filter((row): row is NonNullable<typeof row> => row !== null);
    const externalChannelSummary = summarizeExternalChannels(externalFinanceOrders);

    return {
      context,
      storeId,
      store: storeResult.data,
      period: selectedPeriod,
      accounts,
      categories: categoriesResult.data ?? [],
      obligations: obligationsResult.data ?? [],
      transactions: transactionsResult.data ?? [],
      suppliers,
      pendingDeliveryPayments,
      externalChannelSummary,
      report,
      canManage,
      canSettle,
      canReports,
    };
  }
}
