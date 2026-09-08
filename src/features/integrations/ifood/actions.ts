"use server";

import { revalidatePath } from "next/cache";
import { IfoodIntegrationSettingsService, type IfoodCapabilityKey } from "@/server/integrations/providers/ifood/ifood-integration-settings-service";
import { isIfoodEnvironment, sanitizeIfoodError, type IfoodEnvironment, type IfoodStartConnectionResult } from "@/server/integrations/providers/ifood/ifood-auth-model";

export type IfoodUiActionResult =
  | { ok: true; flow: IfoodStartConnectionResult }
  | { ok: true; connected: true }
  | { ok: true; disconnected: true }
  | { ok: true; capabilityUpdated: true }
  | { ok: false; error: string };

function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const value = sanitizeIfoodError(error).toLowerCase();
  if (raw.includes("cardápio e preços independentes")) return raw;
  if (raw.includes("não foi liberada para produção")) return raw;
  if (raw.includes("conexão iFood saudável")) return raw;
  if (value.includes("credentials are not configured") || value.includes("client id is not configured") || value.includes("client secret is not configured")) {
    return "As credenciais do aplicativo iFood ainda não estão configuradas para este ambiente.";
  }
  if (value.includes("replay") || value.includes("invalid_state") || value.includes("expired")) {
    return "Essa autorização não é mais válida. Inicie uma nova conexão com o iFood.";
  }
  if (value.includes("already linked to another store")) {
    return "Este estabelecimento iFood já está vinculado a outra unidade do PedeAqui.";
  }
  if (value.includes("refresh is already in progress")) {
    return "A conexão está sendo renovada. Tente novamente em instantes.";
  }
  return "Não foi possível concluir a operação com o iFood agora. Nenhuma configuração operacional foi alterada.";
}

function refresh() {
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/integracoes");
  revalidatePath("/platform/integracoes");
}

export async function setIfoodCapabilityAction(input: {
  merchantId: string;
  capability: IfoodCapabilityKey;
  enabled: boolean;
}): Promise<IfoodUiActionResult> {
  try {
    await IfoodIntegrationSettingsService.setCapability({ ...input, reason: input.enabled ? "restaurant_enable" : "restaurant_rollback" });
    refresh();
    return { ok: true, capabilityUpdated: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function startIfoodConnectionAction(environment: string): Promise<IfoodUiActionResult> {
  if (!isIfoodEnvironment(environment)) return { ok: false, error: "Ambiente iFood inválido." };
  try {
    const flow = await IfoodIntegrationSettingsService.startConnection(environment as IfoodEnvironment);
    refresh();
    return { ok: true, flow };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function completeIfoodAuthorizationAction(input: {
  integrationAccountId: string;
  sessionId: string;
  state: string;
  authorizationCode: string;
}): Promise<IfoodUiActionResult> {
  if (!input.authorizationCode.trim()) return { ok: false, error: "Informe o código de autorização exibido pelo iFood." };
  try {
    const flow = await IfoodIntegrationSettingsService.completeDistributedAuthorization(input);
    refresh();
    return { ok: true, flow };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function bindIfoodMerchantAction(input: {
  integrationAccountId: string;
  merchantId: string;
}): Promise<IfoodUiActionResult> {
  try {
    await IfoodIntegrationSettingsService.bindMerchant(input);
    refresh();
    return { ok: true, connected: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}

export async function disconnectIfoodAction(integrationAccountId: string): Promise<IfoodUiActionResult> {
  try {
    await IfoodIntegrationSettingsService.disconnect(integrationAccountId);
    refresh();
    return { ok: true, disconnected: true };
  } catch (error) {
    return { ok: false, error: safeMessage(error) };
  }
}
