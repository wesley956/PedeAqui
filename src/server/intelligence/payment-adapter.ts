import { paymentMethodLabels, type PaymentMethod } from "@/server/checkout/schemas";
import type { AuthoritySnapshot } from "@/server/intelligence/authority";
import type { IntelligenceContext } from "@/server/intelligence/context";
import {
  resolveCashTendered,
  type PaymentRecordStatus,
} from "@/server/payments/payment-model";
import { PaymentService } from "@/server/payments/payment-service";
import {
  OrderPixService,
  type PublicPixPayment,
} from "@/server/payments/order-pix-service";
import {
  StorePaymentMethodService,
  type StorePaymentMethodOption,
} from "@/server/payments/store-payment-method-service";
import type { PaymentStatus } from "@/server/orders/state-machines";

export const INTELLIGENCE_CANONICAL_PAYMENT_FLAG = "intelligence_canonical_payment" as const;
export const INTELLIGENCE_CANONICAL_PAYMENT_MODE = "shadow" as const;

export const INTELLIGENCE_PAYMENT_TOOLS = [
  "payment.methods.get",
  "payment.pix.get",
  "payment.change.validate",
  "payment.status.get",
] as const;

export type IntelligencePaymentTool = (typeof INTELLIGENCE_PAYMENT_TOOLS)[number];

export type PaymentMethodProjection = {
  id: string;
  method: PaymentMethod;
  label: string;
  custom: boolean;
};

export type PaymentLedgerItemProjection = {
  method: Exclude<PaymentMethod, "custom">;
  status: PaymentRecordStatus;
  amountCents: number;
  cashTenderedCents: number | null;
  changeDueCents: number | null;
  paidAt: string | null;
  failedAt: string | null;
  refundedAt: string | null;
};

export type PaymentStatusProjection = {
  orderId: string;
  orderPaymentStatus: PaymentStatus;
  totalCents: number;
  summary: {
    paidCents: number;
    reservedCents: number;
    failedCents: number;
    remainingCents: number;
    availableToReserveCents: number;
    settled: boolean;
  };
  payments: PaymentLedgerItemProjection[];
  authority: {
    paymentAuthority: AuthoritySnapshot["paymentAuthority"];
    provider: AuthoritySnapshot["provider"];
  } | null;
};

export type PaymentChangeProjection = {
  orderId: string;
  totalCents: number;
  cashTenderedCents: number;
  changeDueCents: number;
};

type CanonicalPaymentRead = Awaited<ReturnType<typeof PaymentService.listForOrder>>;

export type PaymentAdapterDependencies = {
  listMethods: typeof StorePaymentMethodService.listForStore;
  listForOrder: typeof PaymentService.listForOrder;
  getExistingPix: typeof OrderPixService.getExistingForOrder;
  resolveCash: typeof resolveCashTendered;
};

const defaultDependencies: PaymentAdapterDependencies = {
  listMethods: StorePaymentMethodService.listForStore.bind(StorePaymentMethodService),
  listForOrder: PaymentService.listForOrder.bind(PaymentService),
  getExistingPix: OrderPixService.getExistingForOrder.bind(OrderPixService),
  resolveCash: resolveCashTendered,
};

export class PaymentScopeError extends Error {
  constructor(message = "Payment projection is outside the Intelligence context scope") {
    super(message);
    this.name = "PaymentScopeError";
  }
}

export class PaymentProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProjectionError";
  }
}

function projectMethod(option: StorePaymentMethodOption): PaymentMethodProjection {
  if (option.method === "custom") {
    if (!option.customPaymentMethodId || !option.label) {
      throw new PaymentProjectionError("Canonical custom payment method is missing its public identity");
    }
    return {
      id: option.customPaymentMethodId,
      method: "custom",
      label: option.label,
      custom: true,
    };
  }
  return {
    id: option.method,
    method: option.method,
    label: paymentMethodLabels[option.method],
    custom: false,
  };
}

function projectLedgerItem(payment: CanonicalPaymentRead["payments"][number]): PaymentLedgerItemProjection {
  return {
    method: payment.method as PaymentLedgerItemProjection["method"],
    status: payment.status as PaymentRecordStatus,
    amountCents: Number(payment.amount_cents),
    cashTenderedCents: payment.cash_tendered_cents === null ? null : Number(payment.cash_tendered_cents),
    changeDueCents: payment.change_due_cents === null ? null : Number(payment.change_due_cents),
    paidAt: payment.paid_at,
    failedAt: payment.failed_at,
    refundedAt: payment.refunded_at,
  };
}

export class PaymentAdapter {
  constructor(
    private readonly context: IntelligenceContext,
    private readonly authoritySnapshot: AuthoritySnapshot | null = null,
    private readonly dependencies: PaymentAdapterDependencies = defaultDependencies,
  ) {}

  async methods(): Promise<PaymentMethodProjection[]> {
    const methods = await this.dependencies.listMethods(this.context.organizationId, this.context.storeId);
    return methods.filter((method) => method.enabled).map(projectMethod);
  }

  async pix(orderId: string): Promise<PublicPixPayment | null> {
    await this.requireCanonicalOrder(orderId);
    const authority = this.requireAuthorityScope(orderId);
    if (authority?.decisions.offer_pedeaqui_pix.route === "deny" || authority?.paymentAuthority === "provider") {
      return null;
    }
    return this.dependencies.getExistingPix(orderId);
  }

  async validateChange(orderId: string, cashChangeForCents: number | null): Promise<PaymentChangeProjection> {
    const canonical = await this.requireCanonicalOrder(orderId);
    const totalCents = Number(canonical.order.total_cents);
    const resolved = this.dependencies.resolveCash(totalCents, null, cashChangeForCents);
    return {
      orderId,
      totalCents,
      cashTenderedCents: resolved.tenderedCents,
      changeDueCents: resolved.changeDueCents,
    };
  }

  async status(orderId: string): Promise<PaymentStatusProjection> {
    const canonical = await this.requireCanonicalOrder(orderId);
    const authority = this.requireAuthorityScope(orderId);
    return {
      orderId,
      orderPaymentStatus: canonical.order.payment_status as PaymentStatus,
      totalCents: Number(canonical.order.total_cents),
      summary: canonical.summary,
      payments: canonical.payments.map(projectLedgerItem),
      authority: this.context.audience === "customer" || !authority
        ? null
        : {
            paymentAuthority: authority.paymentAuthority,
            provider: authority.provider,
          },
    };
  }

  private assertActiveOrder(orderId: string) {
    const activeOrderId = this.context.activeReferences.orderId;
    if (activeOrderId && activeOrderId !== orderId) {
      throw new PaymentScopeError("Requested payment order does not match the active order reference");
    }
  }

  private async requireCanonicalOrder(orderId: string): Promise<CanonicalPaymentRead> {
    this.assertActiveOrder(orderId);
    const canonical = await this.dependencies.listForOrder(orderId);
    if (
      canonical.context.organizationId !== this.context.organizationId
      || canonical.context.storeId !== this.context.storeId
      || canonical.order.id !== orderId
    ) {
      throw new PaymentScopeError("Canonical payment scope does not match IntelligenceContext");
    }
    return canonical;
  }

  private requireAuthorityScope(orderId: string) {
    if (!this.authoritySnapshot) return null;
    if (
      this.authoritySnapshot.organizationId !== this.context.organizationId
      || this.authoritySnapshot.storeId !== this.context.storeId
      || this.authoritySnapshot.orderId !== orderId
    ) {
      throw new PaymentScopeError("Payment authority scope does not match IntelligenceContext");
    }
    return this.authoritySnapshot;
  }
}
