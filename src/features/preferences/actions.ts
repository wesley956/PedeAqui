"use server";

import { revalidatePath } from "next/cache";
import { isExperienceMode } from "@/modules/user-experience";
import { UserExperienceService } from "@/server/preferences/user-experience-service";

export async function setExperienceModeAction(formData: FormData) {
  const raw = String(formData.get("mode") ?? "");
  if (!isExperienceMode(raw)) throw new Error("Modo de experiência inválido");
  await UserExperienceService.set(raw);
  revalidatePath("/", "layout");
}
