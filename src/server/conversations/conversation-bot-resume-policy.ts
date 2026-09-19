export type BotResumeSessionReason =
  | "no_session"
  | "session_inactive"
  | "session_expired"
  | "order_context_missing"
  | "cart_inactive"
  | "preserve_order_step"
  | "preserve_non_order_step";

export type BotResumeSessionDecision =
  | { mode: "preserve"; reason: "preserve_order_step" | "preserve_non_order_step" }
  | { mode: "safe_menu"; reason: Exclude<BotResumeSessionReason, "preserve_order_step" | "preserve_non_order_step"> };

const ORDER_STEPS = new Set([
  "order_items",
  "order_name",
  "order_fulfillment",
  "order_address",
  "order_payment",
  "order_confirmation",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isResumeOrderStep(step: string | null | undefined) {
  return Boolean(step && ORDER_STEPS.has(step));
}

export function resumeCartToken(context: unknown) {
  const record = asRecord(context);
  if (!record || record.channel !== "whatsapp_order") return null;
  return typeof record.cartToken === "string" && record.cartToken.trim()
    ? record.cartToken.trim()
    : null;
}

export function resolveBotResumeSession(input: {
  session: {
    state: string;
    step: string;
    context: unknown;
    expiresAt: string | null;
  } | null;
  nowMs: number;
  cartActive: boolean | null;
}): BotResumeSessionDecision {
  const session = input.session;
  if (!session) return { mode: "safe_menu", reason: "no_session" };
  if (session.state !== "active") return { mode: "safe_menu", reason: "session_inactive" };

  if (session.expiresAt) {
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= input.nowMs) {
      return { mode: "safe_menu", reason: "session_expired" };
    }
  }

  if (!isResumeOrderStep(session.step)) {
    return { mode: "preserve", reason: "preserve_non_order_step" };
  }

  if (!resumeCartToken(session.context)) {
    return { mode: "safe_menu", reason: "order_context_missing" };
  }
  if (input.cartActive !== true) {
    return { mode: "safe_menu", reason: "cart_inactive" };
  }

  return { mode: "preserve", reason: "preserve_order_step" };
}
