import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export class PublicMenuLinkService {
  static async getCurrentStore() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    if (!context.storeId) throw new Error("An active store is required");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("stores")
      .select("id,name,slug")
      .eq("organization_id", context.organizationId)
      .eq("id", context.storeId)
      .single();

    if (error) throw error;
    return data;
  }

  static buildUrl(slug: string) {
    const baseUrl = (process.env.PUBLIC_APP_URL || process.env.APP_URL || "https://cruz-iota.vercel.app").replace(/\/+$/, "");
    return `${baseUrl}/m/${encodeURIComponent(slug)}`;
  }
}
