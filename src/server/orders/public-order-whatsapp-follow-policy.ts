import { normalizeWhatsAppIdentifier } from "@/server/conversations/model";
import type { WhatsAppWindowStatus } from "@/server/conversations/whatsapp-send-policy";

export type PublicOrderWhatsAppFollowProjection = {
  available: boolean;
  windowStatus: WhatsAppWindowStatus;
  windowExpiresAt: string | null;
  href: string | null;
  requiresCustomerSend: boolean;
  message: string | null;
};

export function buildPublicOrderWhatsAppFollowMessage(displayNumber: number) {
  return `Olá! Quero acompanhar meu pedido #${displayNumber} pelo WhatsApp.`;
}

export function buildPublicOrderWhatsAppFollowProjection(input: {
  displayNumber: number;
  displayPhoneNumber: string | null | undefined;
  connectionReady: boolean;
  windowStatus: WhatsAppWindowStatus;
  windowExpiresAt: string | null;
}): PublicOrderWhatsAppFollowProjection {
  const phone = normalizeWhatsAppIdentifier(input.displayPhoneNumber);
  const channelAvailable = input.connectionReady && Boolean(phone);

  if (!channelAvailable) {
    return {
      available: false,
      windowStatus: input.windowStatus,
      windowExpiresAt: input.windowExpiresAt,
      href: null,
      requiresCustomerSend: false,
      message: null,
    };
  }

  if (input.windowStatus === "open") {
    return {
      available: true,
      windowStatus: "open",
      windowExpiresAt: input.windowExpiresAt,
      href: null,
      requiresCustomerSend: false,
      message: null,
    };
  }

  const message = buildPublicOrderWhatsAppFollowMessage(input.displayNumber);
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return {
    available: true,
    windowStatus: input.windowStatus,
    windowExpiresAt: input.windowExpiresAt,
    href,
    requiresCustomerSend: true,
    message,
  };
}
