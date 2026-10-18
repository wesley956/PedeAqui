"use server";

import { revalidatePath } from "next/cache";
import { NAVIGATION_PIN_LIMIT, sanitizeNavigationPins } from "@/components/layout/navigation-model";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { NavigationPreferenceService } from "@/server/preferences/navigation-preference-service";

type ActionResult = { ok: boolean; message: string };

/** Salva os itens fixados no menu principal, na ordem recebida. Só aceita itens que o usuário pode ver. */
export async function saveNavigationPinsAction(keys: string[]): Promise<ActionResult> {
  try {
    const access = await NavigationAccessService.load();
    const allowed = new Set(access.items.map((item) => item.key));
    const pins = sanitizeNavigationPins(keys, allowed, NAVIGATION_PIN_LIMIT);
    if (pins.length === 0) return { ok: false, message: "Escolha pelo menos um item para o menu principal." };
    await NavigationPreferenceService.set(pins, access.context);
    revalidatePath("/", "layout");
    return { ok: true, message: "Menu salvo." };
  } catch {
    return { ok: false, message: "Não foi possível salvar o menu agora. Tente novamente." };
  }
}

/** Volta ao menu padrão da função do usuário. */
export async function resetNavigationPinsAction(): Promise<ActionResult> {
  try {
    await NavigationPreferenceService.set(null);
    revalidatePath("/", "layout");
    return { ok: true, message: "Menu padrão restaurado." };
  } catch {
    return { ok: false, message: "Não foi possível restaurar o menu agora. Tente novamente." };
  }
}
