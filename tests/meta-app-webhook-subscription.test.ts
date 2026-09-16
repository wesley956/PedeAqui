import { describe, expect, it } from "vitest";
import {
  certifyMetaWhatsAppWebhookSubscription,
} from "@/server/conversations/meta-app-webhook-subscription";

describe("Meta App WhatsApp webhook field certification", () => {
  it("confirms an active whatsapp_business_account subscription with required Coexistence fields", () => {
    const result = certifyMetaWhatsAppWebhookSubscription({
      data: [{
        object: "whatsapp_business_account",
        active: true,
        fields: [
          { name: "messages", version: "v25.0" },
          { name: "smb_message_echoes", version: "v25.0" },
          { name: "smb_app_state_sync", version: "v25.0" },
          { name: "history", version: "v25.0" },
        ],
      }],
    });

    expect(result.status).toBe("subscribed");
    expect(result.errorKind).toBeNull();
    expect(result.fields).toEqual(["history", "messages", "smb_app_state_sync", "smb_message_echoes"]);
  });

  it("reports smb_message_echoes explicitly when messages is present but the Coexistence echo field is missing", () => {
    expect(certifyMetaWhatsAppWebhookSubscription({
      data: [{ object: "whatsapp_business_account", active: true, fields: ["messages"] }],
    })).toEqual({
      status: "not_subscribed",
      errorKind: "meta_webhook_field_missing_smb_message_echoes",
      fields: ["messages"],
    });
  });

  it("distinguishes missing object, inactive subscription and unavailable field details", () => {
    expect(certifyMetaWhatsAppWebhookSubscription({ data: [] })).toMatchObject({
      status: "not_subscribed",
      errorKind: "meta_webhook_object_not_subscribed",
    });
    expect(certifyMetaWhatsAppWebhookSubscription({
      data: [{ object: "whatsapp_business_account", active: false, fields: ["messages", "smb_message_echoes"] }],
    })).toMatchObject({
      status: "action_required",
      errorKind: "meta_webhook_subscription_inactive",
    });
    expect(certifyMetaWhatsAppWebhookSubscription({
      data: [{ object: "whatsapp_business_account", active: true }],
    })).toMatchObject({
      status: "action_required",
      errorKind: "meta_webhook_fields_unavailable",
    });
  });

  it("keeps the diagnostic schema technical and free of conversation content or credentials", () => {
    const fieldNames = [
      "app_webhook_status",
      "app_webhook_checked_at",
      "app_webhook_fields",
      "last_app_webhook_error_kind",
    ];
    expect(fieldNames.join(" ")).not.toMatch(/message_body|phone_number|access_token|address|token|secret/i);
  });
});
