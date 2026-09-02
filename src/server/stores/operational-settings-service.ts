import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

export const operationalSettingsSchema = z.object({
  ordersAutoAccept: z.boolean(),
  ordersWorkflowMode: z.enum(["standard", "simplified"]),
  deliveriesAutoCreateWhenReady: z.boolean(),
  deliveriesDriverTrackingEnabled: z.boolean(),
  deliveriesDriverSelfClaimEnabled: z.boolean(),
  deliveriesStationaryAlertMinutes: z.number().int().min(5).max(120),
  deliveriesTrackingRetentionDays: z.number().int().min(1).max(30),
  growthCampaignsEnabled: z.boolean(),
  campaignRatePerMinute: z.number().int().min(1).max(60),
}).superRefine((settings, context) => {
  if (settings.ordersWorkflowMode === "simplified" && !settings.ordersAutoAccept) {
    context.addIssue({ code: "custom", path: ["ordersAutoAccept"], message: "O fluxo simplificado exige autoaceite." });
  }
});

export type OperationalSettings = z.infer<typeof operationalSettingsSchema>;

export const LEGACY_OPERATIONAL_SETTINGS: OperationalSettings = {
  ordersAutoAccept: false,
  ordersWorkflowMode: "standard",
  deliveriesAutoCreateWhenReady: false,
  deliveriesDriverTrackingEnabled: false,
  deliveriesDriverSelfClaimEnabled: false,
  deliveriesStationaryAlertMinutes: 15,
  deliveriesTrackingRetentionDays: 7,
  growthCampaignsEnabled: false,
  campaignRatePerMinute: 10,
};

type SettingsRow = {
  orders_auto_accept: boolean;
  orders_workflow_mode: string;
  deliveries_auto_create_when_ready: boolean;
  deliveries_driver_tracking_enabled: boolean;
  deliveries_driver_self_claim_enabled: boolean;
  deliveries_stationary_alert_minutes: number;
  deliveries_tracking_retention_days: number;
  growth_campaigns_enabled: boolean;
  campaign_rate_per_minute: number;
};

function fromRow(row: SettingsRow | null): OperationalSettings {
  if (!row) return LEGACY_OPERATIONAL_SETTINGS;
  return operationalSettingsSchema.parse({
    ordersAutoAccept: row.orders_auto_accept,
    ordersWorkflowMode: row.orders_workflow_mode,
    deliveriesAutoCreateWhenReady: row.deliveries_auto_create_when_ready,
    deliveriesDriverTrackingEnabled: row.deliveries_driver_tracking_enabled,
    deliveriesDriverSelfClaimEnabled: row.deliveries_driver_self_claim_enabled,
    deliveriesStationaryAlertMinutes: Number(row.deliveries_stationary_alert_minutes),
    deliveriesTrackingRetentionDays: Number(row.deliveries_tracking_retention_days),
    growthCampaignsEnabled: row.growth_campaigns_enabled,
    campaignRatePerMinute: Number(row.campaign_rate_per_minute),
  });
}

async function read(organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("store_operational_settings").select("orders_auto_accept,orders_workflow_mode,deliveries_auto_create_when_ready,deliveries_driver_tracking_enabled,deliveries_driver_self_claim_enabled,deliveries_stationary_alert_minutes,deliveries_tracking_retention_days,growth_campaigns_enabled,campaign_rate_per_minute")
    .eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle();
  if (error) throw error;
  return fromRow(data as SettingsRow | null);
}

export class OperationalSettingsService {
  static async loadCurrent() {
    const context = await authorize(PERMISSIONS.STORES_VIEW);
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária.");
    return { context, settings: await read(context.organizationId, context.storeId) };
  }

  static async saveCurrent(settingsInput: OperationalSettings) {
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária.");
    const settings = operationalSettingsSchema.parse(settingsInput);
    const admin = createAdminClient();
    const before = await read(context.organizationId, context.storeId);
    const payload = {
      organization_id: context.organizationId,
      store_id: context.storeId,
      orders_auto_accept: settings.ordersAutoAccept,
      orders_workflow_mode: settings.ordersWorkflowMode,
      deliveries_auto_create_when_ready: settings.deliveriesAutoCreateWhenReady,
      deliveries_driver_tracking_enabled: settings.deliveriesDriverTrackingEnabled,
      deliveries_driver_self_claim_enabled: settings.deliveriesDriverSelfClaimEnabled,
      deliveries_stationary_alert_minutes: settings.deliveriesStationaryAlertMinutes,
      deliveries_tracking_retention_days: settings.deliveriesTrackingRetentionDays,
      growth_campaigns_enabled: settings.growthCampaignsEnabled,
      campaign_rate_per_minute: settings.campaignRatePerMinute,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("store_operational_settings").upsert(payload, { onConflict: "store_id" });
    if (error) throw error;
    await AuditService.record(context, { action: "store.operational_setup_updated", entityType: "store", entityId: context.storeId, before, after: settings });
    return settings;
  }

  static async loadPlatform(organizationId: string, storeId: string) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    return read(z.string().uuid().parse(organizationId), z.string().uuid().parse(storeId));
  }

  static async savePlatform(input: {
    organizationId: string;
    storeId: string;
    settings: OperationalSettings;
    reason: string;
    requestId: string;
  }) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const settings = operationalSettingsSchema.parse(input.settings);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("set_store_operational_settings_internal", {
      p_organization_id: z.string().uuid().parse(input.organizationId),
      p_store_id: z.string().uuid().parse(input.storeId),
      p_settings: {
        orders_auto_accept: settings.ordersAutoAccept,
        orders_workflow_mode: settings.ordersWorkflowMode,
        deliveries_auto_create_when_ready: settings.deliveriesAutoCreateWhenReady,
        deliveries_driver_tracking_enabled: settings.deliveriesDriverTrackingEnabled,
        deliveries_driver_self_claim_enabled: settings.deliveriesDriverSelfClaimEnabled,
        deliveries_stationary_alert_minutes: settings.deliveriesStationaryAlertMinutes,
        deliveries_tracking_retention_days: settings.deliveriesTrackingRetentionDays,
        growth_campaigns_enabled: settings.growthCampaignsEnabled,
        campaign_rate_per_minute: settings.campaignRatePerMinute,
      },
      p_actor_user_id: access.user.id,
      p_reason: z.string().trim().min(5).max(500).parse(input.reason),
      p_request_id: z.string().trim().min(3).max(120).parse(input.requestId),
    });
    if (error) throw error;
    return data;
  }
}
