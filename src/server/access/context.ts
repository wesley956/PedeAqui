import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/auth/session";

export const ORG_COOKIE = "cruz_org_id";
export const STORE_COOKIE = "cruz_store_id";

export type AccessContext = {
  userId: string;
  organizationId: string;
  storeId: string | null;
  roleId: string | null;
};

export class MissingOrganizationError extends Error {
  constructor() {
    super("User has no active organization");
    this.name = "MissingOrganizationError";
  }
}

const resolveAccessContext = cache(async (): Promise<AccessContext> => {
  const user = await requireAuthenticatedUser();
  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(ORG_COOKIE)?.value;
  const requestedStoreId = cookieStore.get(STORE_COOKIE)?.value;
  const supabase = await createClient();

  let membershipQuery = supabase
    .from("organization_members")
    .select("organization_id, role_id, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (requestedOrganizationId) {
    membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId);
  }

  const { data: memberships, error: membershipError } = await membershipQuery.limit(1);
  if (membershipError) throw membershipError;

  const membership = memberships?.[0];
  if (!membership) throw new MissingOrganizationError();

  let storeQuery = supabase
    .from("stores")
    .select("id, organization_id, is_primary, status")
    .eq("organization_id", membership.organization_id)
    .eq("status", "active");

  if (requestedStoreId) {
    storeQuery = storeQuery.eq("id", requestedStoreId);
  } else {
    storeQuery = storeQuery.order("is_primary", { ascending: false });
  }

  const { data: stores, error: storeError } = await storeQuery.limit(1);
  if (storeError) throw storeError;

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    storeId: stores?.[0]?.id ?? null,
    roleId: membership.role_id,
  };
});

export async function getAccessContext(): Promise<AccessContext> {
  return resolveAccessContext();
}
