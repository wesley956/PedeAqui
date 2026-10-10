import { parsePosMoneyToCents } from "@/features/pdv/model";
import type { PosPaymentMethod } from "@/features/pdv/model";
import type { PosSaleInput } from "@/server/pdv/schemas";
export type PaymentDraft = { id: string; method: PosPaymentMethod; amountText: string; cashReceivedText: string; reference: string };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export function paymentPayload(drafts: readonly PaymentDraft[], totalCents: number) {
  if (drafts.length === 0) return { ok: false as const, error: "Selecione uma forma de pagamento." };
  if (totalCents === 0) {
    const [hint] = drafts;
    if (!hint || drafts.length !== 1) return { ok: false as const, error: "Venda zerada deve manter apenas uma forma de pagamento como referência." };
    return { ok: true as const, value: [{ method: hint.method, amountCents: 0, cashReceivedCents: null, reference: null }] satisfies PosSaleInput["payments"] };
  }
  const lines: PosSaleInput["payments"] = [];
  let paymentTotal = 0;
  for (const draft of drafts) {
    const automaticTotal = drafts.length === 1 && !draft.amountText.trim();
    const amountCents = automaticTotal ? totalCents : parsePosMoneyToCents(draft.amountText);
    if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "Informe o valor de cada parcela de pagamento." };
    let cashReceivedCents: number | null = null;
    if (draft.cashReceivedText.trim()) {
      cashReceivedCents = parsePosMoneyToCents(draft.cashReceivedText);
      if (cashReceivedCents === null) return { ok: false as const, error: "Valor recebido em dinheiro inválido." };
    }
    if (draft.method === "cash" && cashReceivedCents !== null && cashReceivedCents < amountCents) return { ok: false as const, error: "O valor recebido em dinheiro é menor que a parcela." };
    lines.push({ method: draft.method, amountCents, cashReceivedCents: draft.method === "cash" ? cashReceivedCents : null, reference: draft.reference.trim() || null });
    paymentTotal += amountCents;
  }
  if (!Number.isSafeInteger(paymentTotal) || paymentTotal !== totalCents) return { ok: false as const, error: `Os pagamentos somam ${money(paymentTotal)} e precisam fechar em ${money(totalCents)}.` };
  return { ok: true as const, value: lines };
}

export function remainingPaymentCents(drafts: readonly PaymentDraft[], totalCents: number) {
  return Math.max(0, totalCents - drafts.reduce((sum, draft) => sum + (parsePosMoneyToCents(draft.amountText) ?? 0), 0));
}

// The cash portion, rather than the complete sale, determines change in split payments.
export function projectedCashDifferenceCents(payment: PaymentDraft, totalCents: number, paymentCount: number) {
  if (payment.method !== "cash" || !payment.cashReceivedText.trim()) return null;
  const received = parsePosMoneyToCents(payment.cashReceivedText);
  const amount = paymentCount === 1 && !payment.amountText.trim() ? totalCents : parsePosMoneyToCents(payment.amountText);
  if (received === null || amount === null || (amount <= 0 && totalCents > 0)) return null;
  if (totalCents === 0) return 0;
  return received - amount;
}

export function projectedTotalCashChangeCents(drafts: readonly PaymentDraft[], totalCents: number) {
  const resolved = paymentPayload(drafts, totalCents);
  if (!resolved.ok) return null;
  return resolved.value.reduce((total, payment) => total + (payment.method === "cash" ? (payment.cashReceivedCents ?? payment.amountCents) - payment.amountCents : 0), 0);
}
