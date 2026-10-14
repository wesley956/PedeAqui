"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { orderCookieName } from "@/server/orders/order-token";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { OrderPixService, PixPayerDocumentError } from "@/server/payments/order-pix-service";
import { isValidCpf, onlyDigits } from "@/server/payments/providers/pagbank-order-provider";

export type PixDocumentState = { error: string | null };

const inputSchema = z.object({
  slug: z.string().min(1).max(80),
  orderId: z.string().uuid(),
  cpf: z.string().max(20),
});

/** CPF do pagador para o Pix do PagBank. Vai só para o PagBank; o PedeAqui não grava. */
export async function submitPixDocumentAction(_previous: PixDocumentState, formData: FormData): Promise<PixDocumentState> {
  const parsed = inputSchema.safeParse({
    slug: String(formData.get("slug") ?? ""),
    orderId: String(formData.get("orderId") ?? ""),
    cpf: String(formData.get("cpf") ?? ""),
  });
  if (!parsed.success) return { error: "Não foi possível ler os dados. Recarregue a página." };
  const { slug, orderId } = parsed.data;
  const cpf = onlyDigits(parsed.data.cpf);
  if (!isValidCpf(cpf)) return { error: "CPF inválido. Confira os 11 números." };

  const accessToken = (await cookies()).get(orderCookieName(slug, orderId))?.value;
  if (!accessToken) return { error: "Abra o pedido pelo mesmo aparelho em que ele foi feito." };
  const tracking = await PublicOrderService.getTracking(slug, orderId, accessToken);
  if (!tracking) return { error: "Pedido não encontrado." };

  try {
    await OrderPixService.ensureForOrder(orderId, { payerTaxId: cpf });
  } catch (error) {
    if (error instanceof PixPayerDocumentError) return { error: "O PagBank não aceitou esse CPF. Confira e tente de novo." };
    return { error: "Não foi possível gerar o Pix agora. Tente de novo em instantes." };
  }
  revalidatePath(`/m/${slug}/pedido/${orderId}`);
  return { error: null };
}
