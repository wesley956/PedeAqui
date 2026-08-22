"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCommercialModuleProfile, isModuleKey } from "@/modules/module-catalog";
import {
  ModuleConfigurationConflictError,
  ModuleConfigurationError,
  ModuleConfigurationService,
  ModulePresetConfigurationError,
} from "@/server/modules/module-configuration-service";

function errorCode(error: unknown) {
  if (error instanceof ModuleConfigurationConflictError) return "conflict";
  if (error instanceof ModuleConfigurationError) return error.plan.blockers[0]?.code ?? "blocked";
  if (error instanceof ModulePresetConfigurationError) return error.blockers[0]?.code ?? "blocked";
  return "failed";
}

export async function applyModuleChangeAction(formData: FormData) {
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!isModuleKey(moduleKey)) redirect("/configuracoes/modulos?error=invalid_module");
  try {
    await ModuleConfigurationService.apply({ moduleKey, enabled });
  } catch (error) {
    redirect(`/configuracoes/modulos?error=${errorCode(error)}`);
  }
  revalidatePath("/", "layout");
  redirect("/configuracoes/modulos?success=module_updated");
}

export async function applyModulePresetAction(formData: FormData) {
  const preset = String(formData.get("preset") ?? "");
  if (preset !== "essential" && preset !== "complete") redirect("/configuracoes/modulos?error=invalid_preset");
  try {
    await ModuleConfigurationService.applyPreset({ preset });
  } catch (error) {
    redirect(`/configuracoes/modulos?error=${errorCode(error)}`);
  }
  revalidatePath("/", "layout");
  redirect("/configuracoes/modulos?success=preset_updated");
}

export async function applyCommercialModuleProfileAction(formData: FormData) {
  const profile = String(formData.get("profile") ?? "");
  if (!isCommercialModuleProfile(profile)) redirect("/configuracoes/modulos?error=invalid_profile");
  try {
    await ModuleConfigurationService.applyCommercialProfile({ profile });
  } catch (error) {
    redirect(`/configuracoes/modulos?error=${errorCode(error)}`);
  }
  revalidatePath("/", "layout");
  redirect("/configuracoes/modulos?success=profile_updated");
}
