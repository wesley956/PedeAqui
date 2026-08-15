import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CUSTOMER_RECOGNITION_MAX_AGE_SECONDS,
  createCustomerRecognitionToken,
  hashCustomerRecognitionToken,
} from "@/server/customers/recognition-token";

const uuidSchema = z.string().uuid();

export type RecognizedCustomer = {
  customerId: string;
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
  };
  addresses: Array<{
    label: string;
    recipientName: string | null;
    phone: string | null;
    postalCode: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
    reference: string | null;
    isDefault: boolean;
  }>;
};

export class CustomerRecognitionService {
  static async issueFromOrder(orderId: string) {
    const id = uuidSchema.parse(orderId);
    const admin = createAdminClient();
    const { data: order, error } = await admin.from("orders")
      .select("organization_id, store_id, customer_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!order?.customer_id) return null;

    const token = createCustomerRecognitionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_RECOGNITION_MAX_AGE_SECONDS * 1000).toISOString();
    const { error: insertError } = await admin.from("customer_recognition_tokens").insert({
      organization_id: order.organization_id,
      store_id: order.store_id,
      customer_id: order.customer_id,
      token_hash: hashCustomerRecognitionToken(token),
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;
    return { token, expiresAt };
  }

  static async resolve(organizationId: string, storeId: string, token: string | null | undefined): Promise<RecognizedCustomer | null> {
    if (!token || token.length < 32) return null;
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: recognition, error } = await admin.from("customer_recognition_tokens")
      .select("id, customer_id")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("token_hash", hashCustomerRecognitionToken(token))
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    if (error) throw error;
    if (!recognition) return null;

    const [customerResult, addressesResult] = await Promise.all([
      admin.from("customers")
        .select("id, name, phone, email")
        .eq("organization_id", organizationId)
        .eq("id", recognition.customer_id)
        .is("deleted_at", null)
        .maybeSingle(),
      admin.from("customer_addresses")
        .select("label, recipient_name, phone, postal_code, street, number, complement, district, city, state, reference, is_default, created_at")
        .eq("organization_id", organizationId)
        .eq("customer_id", recognition.customer_id)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);
    if (customerResult.error) throw customerResult.error;
    if (addressesResult.error) throw addressesResult.error;
    if (!customerResult.data) return null;

    void admin.from("customer_recognition_tokens")
      .update({ last_used_at: now })
      .eq("id", recognition.id)
      .eq("organization_id", organizationId)
      .eq("store_id", storeId);

    return {
      customerId: customerResult.data.id,
      customer: {
        name: customerResult.data.name,
        phone: customerResult.data.phone,
        email: customerResult.data.email,
      },
      addresses: (addressesResult.data ?? []).map((address) => ({
        label: address.label,
        recipientName: address.recipient_name,
        phone: address.phone,
        postalCode: address.postal_code,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
        reference: address.reference,
        isDefault: address.is_default,
      })),
    };
  }

  static async revoke(organizationId: string, storeId: string, token: string | null | undefined) {
    if (!token) return;
    const admin = createAdminClient();
    const { error } = await admin.from("customer_recognition_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("token_hash", hashCustomerRecognitionToken(token))
      .is("revoked_at", null);
    if (error) throw error;
  }
}
