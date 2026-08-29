import Link from "next/link";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { applyCommercialModuleProfileAction, applyModulePresetAction } from "@/features/modules/actions";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { COMMERCIAL_PROFILE_LABELS, CORE_MODULE_KEYS, MODULE_CATALOG, MODULE_KEYS, isCommercialModuleProfile, isModuleKey, moduleLabel } from "@/modules/module-catalog";
import { ModuleConfigurationService } from "@/server/modules/module-configuration-service";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { ResourcesClient, type ResourceItem } from "./resources-client";
import styles from "./resources.module.css";

const errorMessages: Record<string, string> = {
  conflict: "A configuração mudou em outra aba. Confira novamente antes de confirmar.",
  core_module: "Este recurso faz parte do funcionamento básico do PedeAqui e não pode ser desligado.",
  active_dependent: "Outro recurso ativo depende desta ferramenta.",
  operational_blocker: "Existe uma operação em andamento que precisa ser concluída antes desta mudança.",
  not_in_plan: "Uma das ferramentas não está disponível no plano atual.",
  unsupported_profile: "Esta ferramenta não é compatível com o perfil do negócio.",
  failed: "Não foi possível alterar os recursos agora.",
};

function availabilityLabel(reason: string | null | undefined) {
  if (reason === "not_in_plan") return "Fora do plano";
  if (reason === "not_supported_by_profile") return "Não disponível para este negócio";
  if (reason === "permission_denied") return "Sem permissão";
  return null;
}

export default async function ModulesSettingsPage({ searchParams }: { searchParams: Promise<{ module?: string; preset?: string; profile?: string; error?: string; success?: string }> }) {
  const params = await searchParams;
  const snapshot = await ModuleAccessService.load();
  const vocabulary = businessVocabulary(snapshot.businessType);
  const requestedModule = params.module && isModuleKey(params.module) ? params.module : null;
  const requestedPreset = params.preset === "essential" || params.preset === "complete" ? params.preset : null;
  const presetPreview = requestedPreset ? await ModuleConfigurationService.previewPreset({ preset: requestedPreset }) : null;
  const requestedProfile = params.profile && isCommercialModuleProfile(params.profile) ? params.profile : null;
  const profilePreview = requestedProfile ? await ModuleConfigurationService.previewCommercialProfile({ profile: requestedProfile }) : null;

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
    }];
  });

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>CONFIGURAÇÕES</p><h1>Recursos do PedeAqui</h1><p>Escolha o que sua {vocabulary.unitLabel} usa. O que estiver desligado não precisa ocupar espaço no dia a dia.</p></div>
      <Link href="/configuracoes" className={styles.back}>← Voltar</Link>
    </header>

    <div className={styles.notice}><strong>Sem risco:</strong> desativar um recurso não apaga o histórico. Dependências, plano, permissões e operações em andamento continuam sendo validados pelo servidor antes de qualquer mudança.</div>

    {params.error ? <div className={styles.error} role="alert">{errorMessages[params.error] ?? errorMessages.failed}</div> : null}
    {params.success ? <div className={styles.success} role="status">Configuração atualizada com sucesso.</div> : null}

    <ResourcesClient resources={resources} focusKey={requestedModule} />

    <details className={styles.quick}>
      <summary>Configuração rápida e avançada</summary>
      <p className="muted">Os atalhos abaixo preservam as configurações em lote que já existiam. Você sempre verá uma prévia antes de confirmar.</p>
      <div className={styles.quickLinks}>
        <Link href="/configuracoes/modulos?profile=menu_basic">Cardápio básico</Link>
        <Link href="/configuracoes/modulos?profile=delivery">Delivery</Link>
        <Link href="/configuracoes/modulos?profile=delivery_whatsapp">Delivery + WhatsApp</Link>
        <Link href="/configuracoes/modulos?preset=essential">Configuração Essencial</Link>
        <Link href="/configuracoes/modulos?preset=complete">Configuração Completa</Link>
      </div>
    </details>

    {presetPreview ? <PreviewCard title={`Aplicar ${presetPreview.preset === "essential" ? "Essencial" : "Completo"}`} ready={presetPreview.blockers.length === 0}>
      <p>{presetPreview.changes.length === 0 ? "Sua unidade já está com esta configuração." : `${presetPreview.changes.length} recurso(s) serão ajustados.`}</p>
      {presetPreview.changes.length > 0 ? <p className="muted">{presetPreview.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)}: ${change.enabled ? "ativar" : "desativar"}`).join(" · ")}</p> : null}
      {presetPreview.blockers.map((blocker) => <p role="alert" key={`${blocker.code}:${blocker.moduleKey}`}>Antes de continuar, resolva: {moduleLabel(blocker.moduleKey, snapshot.businessType)}.</p>)}
      <div className={styles.previewActions}>{presetPreview.blockers.length === 0 && presetPreview.changes.length > 0 ? <form action={applyModulePresetAction}><input type="hidden" name="preset" value={presetPreview.preset} /><PendingSubmitButton pendingLabel="Aplicando configuração…">Confirmar configuração</PendingSubmitButton></form> : null}<Link href="/configuracoes/modulos">Cancelar</Link></div>
    </PreviewCard> : null}

    {profilePreview ? <PreviewCard title={`Aplicar ${COMMERCIAL_PROFILE_LABELS[profilePreview.profile]}`} ready={profilePreview.blockers.length === 0}>
      <p>{profilePreview.changes.length === 0 ? "Sua unidade já está com este perfil." : `${profilePreview.changes.length} recurso(s) serão ajustados.`}</p>
      {profilePreview.changes.length > 0 ? <p className="muted">{profilePreview.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)}: ${change.enabled ? "ativar" : "desativar"}`).join(" · ")}</p> : null}
      {profilePreview.blockers.map((blocker) => <p role="alert" key={`${blocker.code}:${blocker.moduleKey}`}>Antes de continuar, resolva: {moduleLabel(blocker.moduleKey, snapshot.businessType)}.</p>)}
      <div className={styles.previewActions}>{profilePreview.blockers.length === 0 && profilePreview.changes.length > 0 ? <form action={applyCommercialModuleProfileAction}><input type="hidden" name="profile" value={profilePreview.profile} /><PendingSubmitButton pendingLabel="Aplicando perfil…">Confirmar perfil</PendingSubmitButton></form> : null}<Link href="/configuracoes/modulos">Cancelar</Link></div>
    </PreviewCard> : null}
  </section>;
}

function PreviewCard({ title, ready, children }: { title: string; ready: boolean; children: React.ReactNode }) {
  return <section className={styles.preview} aria-label="Prévia da alteração"><h2>{title}</h2>{children}<p className="muted">{ready ? "Confira as mudanças e confirme quando estiver tudo certo." : "A alteração não será aplicada enquanto houver bloqueios."}</p></section>;
}
