export type PosPaymentMethod = "cash" | "pix" | "credit_card" | "debit_card";

export type PosCategory = { id: string; name: string; sortOrder: number };
export type PosModifier = { id: string; name: string; priceCents: number };
export type PosModifierGroup = { id: string; name: string; minSelection: number; maxSelection: number; required: boolean; sortOrder: number; modifiers: PosModifier[] };
export type PosProduct = { id: string; categoryId: string | null; name: string; description: string | null; sku: string | null; barcode: string | null; priceCents: number; modifierGroups: PosModifierGroup[] };
export type PosCustomer = { id: string; name: string; phone: string | null; email: string | null; cashbackBalanceCents: number; loyaltyBalancePoints: number };
export type PosPaymentMethodOption = { method: PosPaymentMethod; label: string };
export type PosCartLine = { key: string; productId: string; productName: string; quantity: number; note: string; modifierIds: string[]; modifierLabels: string[]; unitPriceCents: number };
export type PosCoupon = {
  id: string; code: string; name: string; discountType: "fixed" | "percentage"; fixedDiscountCents: number | null;
  percentageBps: number | null; maxDiscountCents: number | null; minimumOrderCents: number;
};
export type PosGrowthSettings = { cashbackEnabled: boolean; loyaltyEnabled: boolean; loyaltyRedeemCentsPerPoint: number };

const combiningMarks = /[\u0300-\u036f]/g;
const whitespace = /\s+/g;
export function normalizePosSearch(value: string) { return value.normalize("NFD").replace(combiningMarks, "").toLocaleLowerCase("pt-BR").replace(whitespace, " ").trim(); }

export function filterPosProducts(products: readonly PosProduct[], categoryId: string | null, query: string) {
  const needle = normalizePosSearch(query);
  return products.filter((product) => {
    if (categoryId && product.categoryId !== categoryId) return false;
    if (!needle) return true;
    return normalizePosSearch([product.name, product.description ?? "", product.sku ?? "", product.barcode ?? ""].join(" ")).includes(needle);
  });
}

export function validateModifierSelection(product: PosProduct, modifierIds: readonly string[]) {
  const unique = new Set(modifierIds);
  if (unique.size !== modifierIds.length) return { valid: false as const, message: "Adicional duplicado." };
  const allowed = new Set(product.modifierGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.id)));
  for (const modifierId of unique) if (!allowed.has(modifierId)) return { valid: false as const, message: "Adicional indisponível para este produto." };
  for (const group of product.modifierGroups) {
    let selected = 0;
    for (const modifier of group.modifiers) if (unique.has(modifier.id)) selected += 1;
    if (selected < group.minSelection) return { valid: false as const, message: `${group.name}: selecione pelo menos ${group.minSelection}.` };
    if (selected > group.maxSelection) return { valid: false as const, message: `${group.name}: selecione no máximo ${group.maxSelection}.` };
  }
  return { valid: true as const, message: null };
}

export function projectedUnitPriceCents(product: PosProduct, modifierIds: readonly string[]) {
  const selected = new Set(modifierIds);
  let total = product.priceCents;
  for (const group of product.modifierGroups) for (const modifier of group.modifiers) if (selected.has(modifier.id)) total += modifier.priceCents;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Preço projetado inválido");
  return total;
}

export function cartTotalCents(lines: readonly PosCartLine[]) {
  let total = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.unitPriceCents) || !Number.isSafeInteger(line.quantity) || line.unitPriceCents < 0 || line.quantity < 1) throw new Error("Linha de carrinho inválida");
    total += line.unitPriceCents * line.quantity;
  }
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total do carrinho inválido");
  return total;
}

export function projectPosGrowth(input: {
  subtotalCents: number;
  couponCode: string;
  coupons: readonly PosCoupon[];
  customer: PosCustomer | null;
  settings: PosGrowthSettings;
  cashbackRedeemCents: number;
  loyaltyRedeemPoints: number;
}) {
  const { subtotalCents, coupons, customer, settings } = input;
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) return { valid: false as const, message: "Subtotal inválido." };
  const code = input.couponCode.trim().toLocaleUpperCase("pt-BR");
  const coupon = code ? coupons.find((item) => item.code.toLocaleUpperCase("pt-BR") === code) ?? null : null;
  if (code && !coupon) return { valid: false as const, message: "Cupom não encontrado ou indisponível." };
  if (coupon && subtotalCents < coupon.minimumOrderCents) return { valid: false as const, message: `O cupom exige pedido mínimo de ${formatMoneyInput(coupon.minimumOrderCents)}.` };

  let couponDiscountCents = 0;
  if (coupon?.discountType === "fixed") couponDiscountCents = Math.min(coupon.fixedDiscountCents ?? 0, subtotalCents);
  if (coupon?.discountType === "percentage") {
    couponDiscountCents = Math.floor(subtotalCents * (coupon.percentageBps ?? 0) / 10000);
    if (coupon.maxDiscountCents !== null) couponDiscountCents = Math.min(couponDiscountCents, coupon.maxDiscountCents);
  }
  let remaining = Math.max(0, subtotalCents - couponDiscountCents);

  if (!Number.isSafeInteger(input.cashbackRedeemCents) || input.cashbackRedeemCents < 0) return { valid: false as const, message: "Cashback inválido." };
  if (input.cashbackRedeemCents > 0 && (!settings.cashbackEnabled || !customer)) return { valid: false as const, message: "Identifique um cliente com cashback habilitado." };
  if (customer && input.cashbackRedeemCents > customer.cashbackBalanceCents) return { valid: false as const, message: "Cashback solicitado é maior que o saldo." };
  if (input.cashbackRedeemCents > remaining) return { valid: false as const, message: "Cashback solicitado é maior que o saldo da venda." };
  const cashbackDiscountCents = input.cashbackRedeemCents;
  remaining -= cashbackDiscountCents;

  if (!Number.isSafeInteger(input.loyaltyRedeemPoints) || input.loyaltyRedeemPoints < 0) return { valid: false as const, message: "Pontos inválidos." };
  if (input.loyaltyRedeemPoints > 0 && (!settings.loyaltyEnabled || !customer)) return { valid: false as const, message: "Identifique um cliente com pontos habilitados." };
  if (customer && input.loyaltyRedeemPoints > customer.loyaltyBalancePoints) return { valid: false as const, message: "Pontos solicitados são maiores que o saldo." };
  const loyaltyDiscountCents = input.loyaltyRedeemPoints * settings.loyaltyRedeemCentsPerPoint;
  if (!Number.isSafeInteger(loyaltyDiscountCents) || loyaltyDiscountCents > remaining) return { valid: false as const, message: "O resgate de pontos ultrapassa o saldo da venda." };

  const discountCents = couponDiscountCents + cashbackDiscountCents + loyaltyDiscountCents;
  return {
    valid: true as const,
    message: null,
    coupon,
    couponDiscountCents,
    cashbackDiscountCents,
    loyaltyDiscountCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}

export function parsePosMoneyToCents(value: string) {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return null;
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimals = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function formatMoneyInput(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Valor inválido");
  return (cents / 100).toFixed(2).replace(".", ",");
}
