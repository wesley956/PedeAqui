"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCommercialModuleProfile, isModuleKey, moduleLabel } from "@/modules/module-catalog";
import {
  ModuleConfigurationConflictError,
  ModuleConfigurationError,
  ModuleConfigurationService,
  ModulePresetConfigurationError,
} from "@/server/modules/module-configuration-service";
import { ModuleAccessService } from "@/server/modules/module-access-service";

function errorCode(error: unknown) {
  if (error instanceof ModuleConfigurationConflictError) return "conflict";
  if (error instanceof ModuleConfigurationError) return error.plan.blockers[0]?.code ?? "blocked";
  if (error instanceof ModulePresetConfigurationError) return error.blockers[0]?.code ?? "blocked";
  return "failed";
}

const inlineMessages: Record<string, string> = {
  conflict: "A configuração mudou em outra aba. Atualize a página e tente novamente.",
  core_module: "Este recurso faz parte do funcionamento básico do PedeAqui e não pode ser desligado.",
  active_dependent: "Outro recurso ativo depende desta função.",
  operational_blocker: "Existe uma operação em andamento que precisa ser concluída antes desta mudança.",
  not_in_plan: "Este recurso não está disponível no plano atual.",
  unsupported_profile: "Este recurso não está disponível para este tipo de negócio.",
  permission_denied: "Você não tem permissão para alterar este recurso.",
  blocked: "Esta alteração está bloqueada pela configuração atual.",
  failed: "Não foi possível alterar o recurso agora.",
};

export type ModuleInlineActionState = {
  status: "idle" | "confirm" | "success" | "error";
  moduleKey?: string;
  enabled?: boolean;
  message?: string;
};

export async function applyModuleChangeInlineAction(previous: ModuleInlineActionState, formData: FormData): Promise<ModuleInlineActionState> {
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!isModuleKey(moduleKey)) return { status: "error", message: "Recurso inválido." };

  try {
    const [preview, snapshot] = await Promise.all([
      ModuleConfigurationService.preview({ moduleKey, enabled }),
      ModuleAccessService.load(),
    ]);
    const blocker = preview.plan.blockers[0];
    if (blocker) return { status: "error", moduleKey, enabled, message: inlineMessages[blocker.code] ?? inlineMessages.blocked };

    const relatedChanges = preview.plan.changes.filter((change) => change.moduleKey !== moduleKey);
    const confirmed = previous.status === "confirm" && previous.moduleKey === moduleKey && previous.enabled === enabled;
    if (!confirmed && (!enabled || relatedChanges.length > 0)) {
      const related = relatedChanges.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)} será ${change.enabled ? "ativado" : "desativado"}`).join(" · ");
      const base = enabled
        ? `Ativar ${moduleLabel(moduleKey, snapshot.businessType)}?`
        : `Desativar ${moduleLabel(moduleKey, snapshot.businessType)}? O histórico continuará salvo.`;
      return { status: "confirm", moduleKey, enabled, message: related ? `${base} ${related}.` : base };
    }

    await ModuleConfigurationService.apply({ moduleKey, enabled });
    revalidatePath("/", "layout");
    return { status: "success", moduleKey, enabled, message: enabled ? "Recurso ativado." : "Recurso desativado." };
  } catch (error) {
    const code = errorCode(error);
    return { status: "error", moduleKey, enabled, message: inlineMessages[code] ?? inlineMessages.failed };
  }
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
