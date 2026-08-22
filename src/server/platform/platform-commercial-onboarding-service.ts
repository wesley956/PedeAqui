import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { normalizeAppUrl } from "@/lib/app-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const inputSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  storeName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(240).optional().or(z.literal("")),
});

type ProvisionResult = {
  organization_id: string;
  store_id: string;
  store_slug: string;
  invitation_id: string | null;
  owner_invited: boolean;
  platform_demo: boolean;
};

function slugBase(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "restaurante";
}

function appUrl() {
  return normalizeAppUrl(process.env.APP_URL, "https://www.pedeaqui.pp.ua");
}

async function requireSuperAdmin() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

export class PlatformCommercialOnboardingService {
  static async provision(rawInput: unknown) {
    const input = inputSchema.parse(rawInput);
    const { user } = await requireSuperAdmin();
    const admin = createAdminClient();
    const ownerEmail = input.ownerEmail || null;
    const rawInviteToken = ownerEmail ? randomBytes(32).toString("base64url") : null;
    const tokenHash = rawInviteToken ? createHash("sha256").update(rawInviteToken).digest("hex") : null;
    const slug = `${slugBase(input.storeName)}-${randomBytes(3).toString("hex")}`;

    const { data, error } = await admin.rpc("platform_provision_restaurant_internal", {
      p_actor_user_id: user.id,
      p_organization_name: input.organizationName,
      p_store_name: input.storeName,
      p_store_slug: slug,
      p_owner_email: ownerEmail,
      p_invite_token_hash: tokenHash,
      p_platform_demo: false,
    });
    if (error) throw error;
    const result = data as ProvisionResult;

    let inviteDelivery: "not_requested" | "sent" | "manual" = ownerEmail ? "manual" : "not_requested";
    if (ownerEmail && rawInviteToken) {
      const redirectTo = `${appUrl()}/convite?token=${encodeURIComponent(rawInviteToken)}`;
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail, { redirectTo });
      if (!inviteError) inviteDelivery = "sent";
    }

    return {
      organizationId: result.organization_id,
      storeId: result.store_id,
      storeSlug: result.store_slug,
      ownerInvited: result.owner_invited,
      inviteDelivery,
    };
  }

  static async ensureDemo() {
    const { user } = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin.from("stores")
      .select("id,organization_id,slug")
      .eq("platform_demo", true)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { storeId: existing.id, organizationId: existing.organization_id, slug: existing.slug };

    const slug = `pedeaqui-demo-${randomBytes(3).toString("hex")}`;
    const { data, error } = await admin.rpc("platform_provision_restaurant_internal", {
      p_actor_user_id: user.id,
      p_organization_name: "PedeAqui Demonstração",
      p_store_name: "Bistrô PedeAqui Demo",
      p_store_slug: slug,
      p_owner_email: null,
      p_invite_token_hash: null,
      p_platform_demo: true,
    });
    if (error) {
      // Duas abas podem tentar criar ao mesmo tempo. Se outra venceu, reutilizamos a demo já criada.
      const { data: raced } = await admin.from("stores")
        .select("id,organization_id,slug")
        .eq("platform_demo", true)
        .limit(1)
        .maybeSingle();
      if (raced) return { storeId: raced.id, organizationId: raced.organization_id, slug: raced.slug };
      throw error;
    }
    const created = data as ProvisionResult;

    const { data: category, error: categoryError } = await admin.from("categories")
      .insert({
        organization_id: created.organization_id,
        store_id: created.store_id,
        name: "Mais pedidos",
        description: "Seleção preparada para demonstrar o cardápio do PedeAqui.",
        sort_order: 1,
        active: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (categoryError) throw categoryError;

    const { error: productsError } = await admin.from("products").insert([
      { organization_id: created.organization_id, store_id: created.store_id, category_id: category.id, name: "Smash PedeAqui", description: "Pão brioche, burger artesanal, queijo e molho da casa.", price_cents: 2890, preparation_time_minutes: 20, active: true, availability: "available", created_by: user.id, updated_by: user.id },
      { organization_id: created.organization_id, store_id: created.store_id, category_id: category.id, name: "Porção Crocante", description: "Batatas sequinhas com tempero especial.", price_cents: 1690, preparation_time_minutes: 15, active: true, availability: "available", created_by: user.id, updated_by: user.id },
      { organization_id: created.organization_id, store_id: created.store_id, category_id: category.id, name: "Combo Família", description: "Dois lanches, porção e bebidas para demonstrar um pedido completo.", price_cents: 6490, preparation_time_minutes: 30, active: true, availability: "available", created_by: user.id, updated_by: user.id },
      { organization_id: created.organization_id, store_id: created.store_id, category_id: category.id, name: "Refrigerante", description: "Lata 350 ml.", price_cents: 690, preparation_time_minutes: 0, active: true, availability: "available", created_by: user.id, updated_by: user.id },
    ]);
    if (productsError) throw productsError;

    const { error: menuError } = await admin.from("store_menu_settings").upsert({
      organization_id: created.organization_id,
      store_id: created.store_id,
      theme: "pedeaqui",
      primary_color: "#FF6B00",
      show_search: true,
      show_categories: true,
      show_product_images: true,
      allow_pickup: true,
      allow_delivery: false,
      minimum_order_cents: 0,
      active: true,
      accepting_orders: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" });
    if (menuError) throw menuError;

    const { error: paymentError } = await admin.from("store_payment_methods").upsert({
      organization_id: created.organization_id,
      store_id: created.store_id,
      method: "cash",
      enabled: true,
      sort_order: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,method" });
    if (paymentError) throw paymentError;

    return { storeId: created.store_id, organizationId: created.organization_id, slug: created.store_slug };
  }
}
