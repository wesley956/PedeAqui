import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAccessContext, type AccessContext } from "@/server/access/context";

/** Coluna ainda não criada no banco (migration 230 pendente): o menu volta ao padrão sem quebrar a tela. */
function isMissingColumn(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/**
 * Itens que o usuário fixou no grupo "Principal" do menu lateral, por unidade.
 * `null` significa "usar o menu padrão da função".
 */
export class NavigationPreferenceService {
  static async load(existingContext?: AccessContext): Promise<string[] | null> {
    const context = existingContext ?? (await getAccessContext());
    if (!context.storeId) return null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_store_preferences")
      .select("navigation_pins")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) {
      if (isMissingColumn(error)) return null;
      throw error;
    }
    const pins = (data as { navigation_pins?: unknown } | null)?.navigation_pins;
    return Array.isArray(pins) ? pins.filter((value): value is string => typeof value === "string") : null;
  }

  static async set(pins: string[] | null, existingContext?: AccessContext) {
    const context = existingContext ?? (await getAccessContext());
    if (!context.storeId) throw new Error("Navigation preference requires an active store");
    const supabase = await createClient();
    const { error } = await supabase.from("user_store_preferences").upsert({
      organization_id: context.organizationId,
      store_id: context.storeId,
      user_id: context.userId,
      navigation_pins: pins && pins.length > 0 ? pins : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,user_id" });
    if (error) throw error;
    return { context, pins };
  }
}
