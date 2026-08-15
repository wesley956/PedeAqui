"use server";

import { revalidatePath } from "next/cache";
import { PlatformAccountSupportService, type AccountSupportCommon } from "@/server/platform/platform-account-support-service";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const common = (form: FormData): AccountSupportCommon => ({
  organizationId: text(form, "organizationId"),
  reason: text(form, "reason"),
  protocol: text(form, "protocol"),
  idempotencyKey: text(form, "idempotencyKey"),
});

function refresh() {
  revalidatePath("/platform");
  revalidatePath("/platform/suporte");
}

export async function supportPasswordRecoveryAction(form: FormData) {
  await PlatformAccountSupportService.sendPasswordRecovery({ ...common(form), memberId: text(form, "memberId") });
  refresh();
}

export async function supportReissueInvitationAction(form: FormData) {
  await PlatformAccountSupportService.reissueInvitation({ ...common(form), invitationId: text(form, "invitationId") });
  refresh();
}

export async function supportReactivateMembershipAction(form: FormData) {
  await PlatformAccountSupportService.reactivateMembership({ ...common(form), memberId: text(form, "memberId") });
  refresh();
}

export async function supportReplaceStoreRoleAction(form: FormData) {
  await PlatformAccountSupportService.replaceStoreRole({
    ...common(form),
    memberId: text(form, "memberId"),
    storeId: text(form, "storeId"),
    roleId: text(form, "roleId"),
    confirmation: text(form, "confirmation") as "ALTERAR ACESSO",
  });
  refresh();
}
