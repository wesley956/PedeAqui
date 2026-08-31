import Link from "next/link";
import { CORE_MODULE_KEYS, MODULE_CATALOG, MODULE_KEYS, isModuleKey, moduleLabel } from "@/modules/module-catalog";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { CommercialCatalogService } from "@/server/billing/commercial-catalog-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessContext } from "@/server/access/context";
import { ResourcesClient, type ResourceItem } from "./resources-client";
import styles from "./resources.module.css";

const errorMessages: Record<string, string> = {
  conflict: "A configuração mudou em outra aba. Confira novamente antes de confirmar.",
  core_module: "Este recurso faz parte do funcionamento básico do PedeAqui e não pode ser desligado.",
  active_dependent: "Outro recurso ativo depende desta ferramenta.",
  operational_blocker: "Existe uma operação em andamento que precisa ser concluída antes desta mudança.",
  not_in_plan: "Esta ferramenta não está incluída no plano atual.",
  unsupported_profile: "Esta ferramenta não é compatível com o perfil do negócio.",
  permission_denied: "Somente quem possui permissão de gestão da empresa pode solicitar um módulo que altera a mensalidade.",
  not_sellable: "Este recurso não está disponível como módulo adicional.",
  subscription_missing: "Não encontramos uma assinatura ativa para receber esta solicitação.",
  store_missing: "Não encontramos uma unidade ativa para esta solicitação.",
  already_available: "Este módulo já está liberado pela sua assinatura. Você pode ativá-lo normalmente.",
  dependency_not_entitled: "Este módulo depende de outro recurso pago que ainda não está incluído na sua assinatura. Solicite primeiro o recurso indicado nas dependências.",
  request_failed: "Não foi possível enviar a solicitação de ativação.",
  failed: "Não foi possível alterar os recursos agora.",
};

function availabilityLabel(reason: string | null | undefined) {
  if (reason === "not_in_plan") return "Fora do plano";
  if (reason === "not_supported_by_profile") return "Não disponível para este negócio";
  if (reason === "permission_denied") return "Sem permissão";
  return null;
}

export default async function ModulesSettingsPage({ searchParams }: { searchParams: Promise<{ module?: string; error?: string; success?: string }> }) {
  const params = await searchParams;
  const [snapshot, commercialModules, context] = await Promise.all([
    ModuleAccessService.load(),
    CommercialCatalogService.listCommercialModules(),
    getAccessContext(),
  ]);
  const requestedModule = params.module && isModuleKey(params.module) ? params.module : null;
  const prices = new Map(commercialModules.map((module) => [module.key, module.monthlyPriceCents]));
  const admin = createAdminClient();
  const { data: pendingRows } = await admin.from("subscription_change_requests")
    .select("feature_id,features(key)")
    .eq("organization_id", context.organizationId)
    .eq("change_type", "add_on")
    .in("status", ["draft", "scheduled"]);
  const pendingKeys = new Set((pendingRows ?? []).flatMap((row) => {
    const relation = row.features as unknown as { key?: string } | { key?: string }[] | null;
    const featureKey = Array.isArray(relation) ? relation[0]?.key : relation?.key;
    if (!featureKey) return [];
    return [featureKey.startsWith("module.") ? featureKey.slice("module.".length) : featureKey];
  }));

  const resources: ResourceItem[] = MODULE_KEYS.flatMap((key) => {
    const definition = MODULE_CATALOG[key];
    if (!definition.supportedBusinessTypes.includes(snapshot.businessType)) return [];
    const enabled = snapshot.enabledModuleKeys.has(key);
    const core = CORE_MODULE_KEYS.includes(key);
    const availability = snapshot.availability[key];
    const blockedActivation = !enabled && (availability.reason === "not_in_plan" || availability.reason === "not_supported_by_profile" || availability.reason === "permission_denied");
    return [{
      key,
      label: moduleLabel(key, snapshot.businessType),
      description: definition.description,
      enabled,
      core,
      canActivate: !blockedActivation,
      availabilityLabel: availabilityLabel(availability.reason),
      dependencies: definition.dependencies.map((dependency) => moduleLabel(dependency, snapshot.businessType)),
      monthlyPriceCents: prices.get(key) ?? null,
      requestPending: pendingKeys.has(key),
    }];
  });

  const successMessage = params.success === "request_created"
    ? "Solicitação enviada. O módulo só será ativado depois da aprovação, com o valor adicional registrado na assinatura."
    : params.success === "request_pending"
      ? "Este módulo já possui uma solicitação aguardando análise."
      : params.success ? "Configuração atualizada com sucesso." : null;

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>CONFIGURAÇÕES</p><h1>Recursos do PedeAqui</h1><p>Use os recursos incluídos no seu plano e solicite módulos extras quando precisar.</p></div>
      <Link href="/configuracoes" className={styles.back}>← Voltar</Link>
    </header>

    <div className={styles.notice}><strong>Regra comercial:</strong> recursos fora do plano não podem ser ativados diretamente. Quando houver preço adicional, você verá o valor e poderá solicitar a ativação. Nada é cobrado ou liberado sem aprovação.</div>
    {params.error ? <div className={styles.error} role="alert">{errorMessages[params.error] ?? errorMessages.failed}</div> : null}
    {successMessage ? <div className={styles.success} role="status">{successMessage}</div> : null}
    <ResourcesClient resources={resources} focusKey={requestedModule} />
    <p className="muted">Os módulos incluídos no plano continuam sujeitos a dependências e operações em andamento. Módulos adicionais são tratados na assinatura e não alteram o preço-base protegido de clientes Fundadores.</p>
  </section>;
}
