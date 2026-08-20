import Link from "next/link";
import { applyModuleChangeAction, applyModulePresetAction } from "@/features/modules/actions";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { CORE_MODULE_KEYS, MODULE_CATALOG, MODULE_KEYS, isModuleKey, moduleLabel } from "@/modules/module-catalog";
import { ModuleConfigurationService } from "@/server/modules/module-configuration-service";
import { ModuleAccessService } from "@/server/modules/module-access-service";

const errorMessages: Record<string, string> = {
  conflict: "A configuração mudou em outra aba. Revise novamente antes de confirmar.",
  core_module: "Este recurso faz parte do núcleo do PedeAqui e não pode ser desligado.",
  active_dependent: "Outro recurso ativo depende desta ferramenta.",
  operational_blocker: "Existe uma operação em andamento que precisa ser concluída antes desta mudança.",
  not_in_plan: "Uma das ferramentas não está disponível no plano atual.",
  unsupported_profile: "Esta ferramenta não é compatível com o perfil do negócio.",
  failed: "Não foi possível alterar os módulos agora.",
};

export default async function ModulesSettingsPage({ searchParams }: { searchParams: Promise<{ module?: string; target?: string; preset?: string; error?: string; success?: string }> }) {
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

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header><p className="muted" style={{ margin: 0 }}>CONFIGURAÇÕES · MÓDULOS</p><h1 style={{ marginBottom: 8 }}>Ferramentas da unidade</h1>
        <p className="muted" style={{ margin: 0 }}>Perfil: {vocabulary.businessLabel}. Ative somente o que ajuda na operação. Desativar uma ferramenta nunca apaga o histórico.</p>
      </header>

      {params.error ? <div className="card" role="alert" style={{ padding: 14 }}>{errorMessages[params.error] ?? errorMessages.failed}</div> : null}
      {params.success ? <div className="card" role="status" style={{ padding: 14 }}>Configuração atualizada com sucesso.</div> : null}

      <section className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
        <div><h2 style={{ margin: 0 }}>Começar com uma recomendação</h2><p className="muted">A recomendação considera o perfil do negócio. Você verá o impacto antes de confirmar.</p></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/configuracoes/modulos?preset=essential">Revisar Essencial</Link>
          <Link href="/configuracoes/modulos?preset=complete">Revisar Completo</Link>
        </div>
      </section>

      {presetPreview ? <PreviewCard title={`Aplicar ${presetPreview.preset === "essential" ? "Essencial" : "Completo"}`} ready={presetPreview.blockers.length === 0}>
        <p>{presetPreview.changes.length === 0 ? "Os módulos já correspondem a esta recomendação." : `${presetPreview.changes.length} ferramenta(s) serão ajustadas.`}</p>
        {presetPreview.changes.length > 0 ? <p className="muted">{presetPreview.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)}: ${change.enabled ? "ativar" : "desativar"}`).join(" · ")}</p> : null}
        {presetPreview.blockers.map((blocker) => <p role="alert" key={`${blocker.code}:${blocker.moduleKey}`}>Antes de continuar, resolva: {moduleLabel(blocker.moduleKey, snapshot.businessType)}.</p>)}
        {presetPreview.blockers.length === 0 ? <form action={applyModulePresetAction}><input type="hidden" name="preset" value={presetPreview.preset} /><button type="submit">Confirmar recomendação</button></form> : null}
      </PreviewCard> : null}

      {modulePreview ? <PreviewCard title={`${requestedEnabled ? "Ativar" : "Desativar"} ${moduleLabel(requestedModule!, snapshot.businessType)}`} ready={modulePreview.plan.status === "ready"}>
        <p>{requestedEnabled ? "As dependências necessárias serão ligadas junto." : "O histórico permanecerá salvo e volta a ficar disponível se o módulo for reativado."}</p>
        {modulePreview.plan.changes.length > 0 ? <p className="muted">Mudanças: {modulePreview.plan.changes.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)} ${change.enabled ? "ativo" : "inativo"}`).join(" · ")}</p> : <p className="muted">Nenhuma mudança é necessária.</p>}
        {modulePreview.plan.blockers.map((blocker) => <p role="alert" key={`${blocker.code}:${blocker.relatedModuleKey ?? blocker.detail ?? ""}`}>{errorMessages[blocker.code] ?? "Mudança bloqueada."}{blocker.relatedModuleKey ? ` ${moduleLabel(blocker.relatedModuleKey, snapshot.businessType)} depende deste recurso.` : ""}</p>)}
        {modulePreview.plan.status === "ready" && modulePreview.plan.changes.length > 0 ? <form action={applyModuleChangeAction}><input type="hidden" name="moduleKey" value={requestedModule!} /><input type="hidden" name="enabled" value={String(requestedEnabled)} /><button type="submit">Confirmar mudança</button></form> : null}
      </PreviewCard> : null}

      <div style={{ display: "grid", gap: 12 }}>
        {MODULE_KEYS.map((key) => {
          const definition = MODULE_CATALOG[key];
          if (!definition.supportedBusinessTypes.includes(snapshot.businessType)) return null;
          const enabled = snapshot.enabledModuleKeys.has(key);
          const core = CORE_MODULE_KEYS.includes(key);
          const availability = snapshot.availability[key];
          return <article className="card" key={key} style={{ padding: 16, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
              <div><strong>{moduleLabel(key, snapshot.businessType)}</strong><p className="muted" style={{ margin: "4px 0 0" }}>{definition.description}</p></div>
              <strong>{core ? "Incluído pelo núcleo" : enabled ? "Ativo" : availability.reason === "not_in_plan" ? "Não disponível no plano" : "Inativo"}</strong>
            </div>
            {definition.dependencies.length > 0 ? <span className="muted">Depende de: {definition.dependencies.map((dependency) => moduleLabel(dependency, snapshot.businessType)).join(", ")}</span> : null}
            {!core ? <div><Link href={`/configuracoes/modulos?module=${key}&target=${enabled ? "off" : "on"}`}>Revisar {enabled ? "desativação" : "ativação"} →</Link></div> : null}
          </article>;
        })}
      </div>
    </section>
  );
}

function PreviewCard({ title, ready, children }: { title: string; ready: boolean; children: React.ReactNode }) {
  return <section className="card" style={{ padding: 18, borderWidth: 2 }} aria-label="Prévia da alteração"><h2 style={{ marginTop: 0 }}>{title}</h2>{children}<p className="muted" style={{ marginBottom: 0 }}>{ready ? "Revise e confirme quando estiver pronto." : "A alteração não será aplicada enquanto houver bloqueios."}</p></section>;
}
