import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const optionalEmail = z.union([z.literal(""), z.string().trim().email("Informe um e-mail válido").max(160)]).transform((value) => value || null);
const optionalWhatsapp = z.string().trim().max(40).refine((value) => {
  if (!value) return true;
  return /^[+()\d\s.-]+$/.test(value) && value.replace(/\D/g, "").length >= 10;
}, "Informe um WhatsApp válido").transform((value) => value || null);
const optionalPublicUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "Informe uma URL completa começando com http:// ou https://").transform((value) => value ? new URL(value).toString() : null);

export const storeProfileInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja").max(120),
  phone: z.string().trim().min(8, "Informe o telefone da loja").max(40),
  email: optionalEmail,
  postalCode: optionalText(20),
  street: optionalText(160),
  number: optionalText(30),
  complement: optionalText(120),
  district: optionalText(120),
  city: z.string().trim().min(2, "Informe a cidade").max(120),
  state: z.string().trim().min(2, "Informe o estado ou UF").max(120),
  publicWhatsapp: optionalWhatsapp,
  websiteUrl: optionalPublicUrl,
  instagramUrl: optionalPublicUrl,
  facebookUrl: optionalPublicUrl,
  tiktokUrl: optionalPublicUrl,
});

export type StoreProfileInput = z.infer<typeof storeProfileInputSchema>;

const profileSelect = "id,name,slug,phone,email,postal_code,street,number,complement,district,city,state,public_whatsapp,website_url,instagram_url,facebook_url,tiktok_url" as const;

export class StoreProfileService {
  static async getProfile() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("stores")
      .select(profileSelect)
      .eq("organization_id", context.organizationId)
      .eq("id", storeId)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateProfile(input: StoreProfileInput) {
    const values = storeProfileInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: before, error: readError } = await admin
      .from("stores")
      .select(profileSelect)
      .eq("organization_id", context.organizationId)
      .eq("id", storeId)
      .single();
    if (readError) throw readError;

    const patch = {
      name: values.name,
      phone: values.phone,
      email: values.email,
      postal_code: values.postalCode,
      street: values.street,
      number: values.number,
      complement: values.complement,
      district: values.district,
      city: values.city,
      state: values.state,
      public_whatsapp: values.publicWhatsapp,
      website_url: values.websiteUrl,
      instagram_url: values.instagramUrl,
      facebook_url: values.facebookUrl,
      tiktok_url: values.tiktokUrl,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("stores")
      .update(patch)
      .eq("organization_id", context.organizationId)
      .eq("id", storeId)
      .select(profileSelect)
      .single();
    if (error) throw error;

    await AuditService.record(context, {
      action: "store.profile_updated",
      entityType: "store",
      entityId: storeId,
      before,
      after: data,
    });
    await EventService.enqueue(context, {
      type: "store.profile_updated",
      entityType: "store",
      entityId: storeId,
      payload: { name: data.name, city: data.city, state: data.state },
    });

    return data;
  }
}
