import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isExperienceMode, type ExperienceMode } from "@/modules/user-experience";
import { getAccessContext, type AccessContext } from "@/server/access/context";

export class UserExperienceService {
  static async load(existingContext?: AccessContext): Promise<ExperienceMode> {
    const context = existingContext ?? (await getAccessContext());
    if (!context.storeId) return "standard";
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_store_preferences")
      .select("experience_mode")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const mode = String(data?.experience_mode ?? "standard");
    return isExperienceMode(mode) ? mode : "standard";
  }

  static async set(mode: ExperienceMode, existingContext?: AccessContext) {
    const context = existingContext ?? (await getAccessContext());
    if (!context.storeId) throw new Error("Experience preference requires an active store");
    const supabase = await createClient();
    const { error } = await supabase.from("user_store_preferences").upsert({
      organization_id: context.organizationId,
      store_id: context.storeId,
      user_id: context.userId,
      experience_mode: mode,
      preference_version: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,user_id" });
    if (error) throw error;
    return { context, mode };
  }
}
