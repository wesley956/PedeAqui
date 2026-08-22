import Link from "next/link";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { applyCommercialModuleProfileAction, applyModuleChangeAction, applyModulePresetAction } from "@/features/modules/actions";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { COMMERCIAL_PROFILE_LABELS, CORE_MODULE_KEYS, MODULE_CATALOG, MODULE_KEYS, isCommercialModuleProfile, isModuleKey, moduleLabel } from "@/modules/module-catalog";
import { ModuleConfigurationService } from "@/server/modules/module-configuration-service";
import { ModuleAccessService } from "@/server/modules/module-access-service";

const errorMessages: Record<string, string> = {
  conflict: "A configuração mudou em outra aba. Confira novamente antes de confirmar.",
  core_module: "Este recurso faz parte do núcleo do PedeAqui e não pode ser desligado.",
  active_dependent: "Outro recurso ativo depende desta ferramenta.",
  operational_blocker: "Existe uma operação em andamento que precisa ser concluída antes desta mudança.",
  not_in_plan: "Uma das ferramentas não está disponível no plano atual.",
  unsupported_profile: "Esta ferramenta não é compatível com o perfil do negócio.",
  failed: "Não foi possível alterar os módulos agora.",
};

export default async function ModulesSettingsPage({ searchParams }: { searchParams: Promise<{ module?: string; target?: string; preset?: string; profile?: string; error?: string; success?: string }> }) {
  const params = await searchParams;
  const snapshot = await ModuleAccessService.load();
  const vocabulary = businessVocabulary(snapshot.businessType);
  const requestedModule = params.module && isModuleKey(params.module) ? params.module : null;
  const requestedEnabled = params.target === "on" ? true : params.target === "off" ? false : null;
  const modulePreview = requestedModule && requestedEnabled !== null
    ? await ModuleConfigurationService.preview({ moduleKey: requestedModule, enabled: requestedEnabled })
    : null;
  const requestedPreset = params.preset === "essential" || params.preset === "complete" ? params.preset : null;
  const presetPreview = requestedPreset ? await ModuleConfigurationService.previewPreset({ preset: requestedPreset }) : null;
  const requestedProfile = params.profile && isCommercialModuleProfile(params.profile) ? params.profile : null;
  const profilePreview = requestedProfile ? await ModuleConfigurationService.previewCommercialProfile({ profile: requestedProfile }) : null;

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header>
        <p className="muted" style={{ margin: 0 }}>CONFIGURAÇÕES · MÓDULOS</p>
        <h1 style={{ marginBottom: 8 }}>Ferramentas da unidade</h1>
        <p className="muted" style={{ margin: 0 }}>Perfil: {vocabulary.businessLabel}. Ligue apenas as ferramentas que sua equipe realmente usa. Desativar uma ferramenta nunca apaga o histórico.</p>
      </header>

      <section className="card" style={{ padding: 16, display: "grid", gap: 6 }} aria-label="Como ativar ou desativar ferramentas">
        <strong>Quer desligar uma ferramenta?</strong>
        <span className="muted">Encontre a ferramenta abaixo, toque em <strong>Desativar</strong> e confirme no mesmo cartão. Nada será alterado até você confirmar.</span>
      </section>

      {params.error ? <div className="card" role="alert" style={{ padding: 14 }}>{errorMessages[params.error] ?? errorMessages.failed}</div> : null}
      {params.success ? <div className="card" role="status" style={{ padding: 14 }}>Configuração atualizada com sucesso.</div> : null}

      <section className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Configurações recomendadas</h2>
          <p className="muted">Se preferir, o PedeAqui pode ajustar um conjunto de ferramentas para o seu tipo de negócio. Você verá tudo o que será alterado antes de confirmar.</p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/configuracoes/modulos?profile=menu_basic">Cardápio básico</Link>
          <Link href="/configuracoes/modulos?profile=delivery">Delivery</Link>
          <Link href="/configuracoes/modulos?profile=delivery_whatsapp">Delivery + WhatsApp</Link>
          <Link href="/configuracoes/modulos?preset=essential">Usar configuração Essencial</Link>
          <Link href="/configuracoes/modulos?preset=complete">Usar configuração Completa</Link>
        </div>
      </section>

      {presetPreview ? <PreviewCard title={`Aplicar ${presetPreview.preset === "essential" ? "Essencial" : "Completo"}`} ready={presetPreview.blockers.length === 0}>
        <p>{presetPreview.changes.length === 0 ? "Sua unidade já está com esta configuração." : `${presetPreview.changes.length} ferramenta(s) serão ajustadas.`}</p>
        {presetPreview.changes.length > 0 ? <p className="muted">{presetPreview.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)}: ${change.enabled ? "ativar" : "desativar"}`).join(" · ")}</p> : null}
        {presetPreview.blockers.map((blocker) => <p role="alert" key={`${blocker.code}:${blocker.moduleKey}`}>Antes de continuar, resolva: {moduleLabel(blocker.moduleKey, snapshot.businessType)}.</p>)}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {presetPreview.blockers.length === 0 && presetPreview.changes.length > 0 ? <form action={applyModulePresetAction}><input type="hidden" name="preset" value={presetPreview.preset} /><PendingSubmitButton pendingLabel="Aplicando configuração…">Confirmar configuração</PendingSubmitButton></form> : null}
          <Link href="/configuracoes/modulos">Cancelar</Link>
        </div>
      </PreviewCard> : null}

      {profilePreview ? <PreviewCard title={`Aplicar ${COMMERCIAL_PROFILE_LABELS[profilePreview.profile]}`} ready={profilePreview.blockers.length === 0}>
        <p>{profilePreview.changes.length === 0 ? "Sua unidade já está com este perfil." : `${profilePreview.changes.length} ferramenta(s) serão ajustadas.`}</p>
        {profilePreview.changes.length > 0 ? <p className="muted">{profilePreview.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)}: ${change.enabled ? "ativar" : "desativar"}`).join(" · ")}</p> : null}
        {profilePreview.blockers.map((blocker) => <p role="alert" key={`${blocker.code}:${blocker.moduleKey}`}>Antes de continuar, resolva: {moduleLabel(blocker.moduleKey, snapshot.businessType)}.</p>)}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {profilePreview.blockers.length === 0 && profilePreview.changes.length > 0 ? <form action={applyCommercialModuleProfileAction}><input type="hidden" name="profile" value={profilePreview.profile} /><PendingSubmitButton pendingLabel="Aplicando perfil…">Confirmar perfil</PendingSubmitButton></form> : null}
          <Link href="/configuracoes/modulos">Cancelar</Link>
        </div>
      </PreviewCard> : null}

      <div style={{ display: "grid", gap: 12 }}>
        {MODULE_KEYS.map((key) => {
          const definition = MODULE_CATALOG[key];
          if (!definition.supportedBusinessTypes.includes(snapshot.businessType)) return null;
          const enabled = snapshot.enabledModuleKeys.has(key);
          const core = CORE_MODULE_KEYS.includes(key);
          const availability = snapshot.availability[key];
          const selectedPreview = requestedModule === key ? modulePreview : null;
          const selectedTarget = requestedModule === key ? requestedEnabled : null;
          const unavailableToActivate = !enabled && (availability.reason === "not_in_plan" || availability.reason === "not_supported_by_profile");

          return <article className="card" key={key} style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <strong>{moduleLabel(key, snapshot.businessType)}</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>{definition.description}</p>
              </div>
              <strong>{core ? "Sempre ativo" : enabled ? "Ativo" : availability.reason === "not_in_plan" ? "Fora do plano" : "Inativo"}</strong>
            </div>

            {definition.dependencies.length > 0 ? <span className="muted">Precisa de: {definition.dependencies.map((dependency) => moduleLabel(dependency, snapshot.businessType)).join(", ")}</span> : null}

            {!core && !selectedPreview ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {unavailableToActivate ? <span className="muted">Esta ferramenta não pode ser ativada com a configuração atual.</span> : (
                  <Link href={`/configuracoes/modulos?module=${key}&target=${enabled ? "off" : "on"}`}>
                    {enabled ? "Desativar" : "Ativar"}
                  </Link>
                )}
              </div>
            ) : null}

            {selectedPreview && selectedTarget !== null ? (
              <section style={{ display: "grid", gap: 10, padding: 14, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg)", background: "var(--surface-2)" }} aria-label={`${selectedTarget ? "Ativar" : "Desativar"} ${moduleLabel(key, snapshot.businessType)}`}>
                <div>
                  <strong>{selectedTarget ? "Ativar" : "Desativar"} {moduleLabel(key, snapshot.businessType)}?</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Nada será alterado até você confirmar.</p>
                </div>

                <p style={{ margin: 0 }}>{selectedTarget
                  ? "Se esta ferramenta precisar de outra para funcionar, o PedeAqui mostrará isso antes da confirmação."
                  : "A ferramenta sairá dos menus desta unidade, mas todo o histórico continuará salvo para quando você ativá-la novamente."}</p>

                {selectedPreview.plan.changes.length > 0 ? (
                  <p className="muted" style={{ margin: 0 }}>Também será alterado: {selectedPreview.plan.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)} ${change.enabled ? "ativo" : "inativo"}`).join(" · ")}</p>
                ) : <p className="muted" style={{ margin: 0 }}>Nenhuma mudança adicional é necessária.</p>}

                {selectedPreview.plan.blockers.map((blocker) => (
                  <p role="alert" key={`${blocker.code}:${blocker.relatedModuleKey ?? blocker.detail ?? ""}`} style={{ margin: 0 }}>
                    {errorMessages[blocker.code] ?? "Mudança bloqueada."}{blocker.relatedModuleKey ? ` ${moduleLabel(blocker.relatedModuleKey, snapshot.businessType)} depende deste recurso.` : ""}
                  </p>
                ))}

                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  {selectedPreview.plan.status === "ready" && selectedPreview.plan.changes.length > 0 ? (
                    <form action={applyModuleChangeAction}>
                      <input type="hidden" name="moduleKey" value={key} />
                      <input type="hidden" name="enabled" value={String(selectedTarget)} />
                      <PendingSubmitButton pendingLabel={selectedTarget ? "Ativando…" : "Desativando…"}>{selectedTarget ? "Confirmar ativação" : "Confirmar desativação"}</PendingSubmitButton>
                    </form>
                  ) : null}
                  <Link href="/configuracoes/modulos">Cancelar</Link>
                </div>
              </section>
            ) : null}
          </article>;
        })}
      </div>
    </section>
  );
}

function PreviewCard({ title, ready, children }: { title: string; ready: boolean; children: React.ReactNode }) {
  return <section className="card" style={{ padding: 18, borderWidth: 2 }} aria-label="Prévia da alteração"><h2 style={{ marginTop: 0 }}>{title}</h2>{children}<p className="muted" style={{ marginBottom: 0 }}>{ready ? "Confira as mudanças e confirme quando estiver tudo certo." : "A alteração não será aplicada enquanto houver bloqueios."}</p></section>;
}
