"use server";

import { revalidatePath } from "next/cache";
import { PlatformIncidentService } from "@/server/platform/platform-incident-service";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const nullable = (form: FormData, key: string) => text(form, key) || null;

export async function setIncidentLifecycleAction(form: FormData) {
  await PlatformIncidentService.setLifecycle({
    fingerprint: text(form, "fingerprint"),
    status: text(form, "status") as "open" | "investigating" | "resolved",
    severity: text(form, "severity") as "P0" | "P1" | "P2" | "P3",
    category: text(form, "category"), title: text(form, "title"), summary: text(form, "summary"),
    sourceKind: text(form, "sourceKind"), sourceReference: nullable(form, "sourceReference"),
    organizationId: nullable(form, "organizationId"), storeId: nullable(form, "storeId"),
    occurrenceCount: text(form, "occurrenceCount"), firstSeenAt: text(form, "firstSeenAt"), lastSeenAt: text(form, "lastSeenAt"),
    note: text(form, "note"),
  });
  revalidatePath("/platform/incidentes");
  revalidatePath("/platform");
}
