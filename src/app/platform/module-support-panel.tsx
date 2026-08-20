import { randomUUID } from "node:crypto";
import { supportModuleAction } from "@/features/platform-support/actions";
import { PlatformSupportReadService } from "@/server/platform/platform-support-read-service";
import styles from "./platform.module.css";

export async function ModuleSupportPanel({ organizationId, storeId }: { organizationId: string; storeId: string }) {
  const state = await PlatformSupportReadService.load(organizationId, storeId);
  if (state.role !== "super_admin" || !state.config) return null;
  const config = state.config;
  const active = config.modules.filter((module) => module.enabled).length;
  const blocked = config.modules.filter((module) => !module.entitled).length;

  return <section className={styles.section}>
    <div className={styles.sectionHeader}>
      <div><h2>Assistência de módulos</h2><p>O mesmo motor de módulos usado pelo estabelecimento valida perfil, plano, dependências e operações abertas antes de qualquer alteração.</p></div>
      <span className={styles.pill} data-tone="warn">{active} ativos · {blocked} fora do plano</span>
    </div>
    <p className={styles.advancedNote}>A mudança é pré-validada no servidor antes de gravar. Módulos essenciais, dependências ativas, operações em andamento e recursos fora do plano são bloqueados. Nenhum histórico é apagado.</p>
    <div className={styles.supportGrid}>
      <article className={styles.supportCard}>
        <strong>Configuração atual</strong>
        <span>Perfil: {config.businessType === "gas" ? "Revenda de gás" : config.businessType === "restaurant" ? "Restaurante / Lanchonete" : "Outro comércio"}</span>
        <span>Preset: {config.modulePreset === "essential" ? "Essencial" : config.modulePreset === "complete" ? "Completo" : "Personalizado"}</span>
        <span>{config.modules.filter((module) => module.enabled).map((module) => module.label).join(" · ") || "Nenhum módulo opcional ativo"}</span>
        {blocked > 0 ? <span>Indisponíveis pelo plano: {config.modules.filter((module) => !module.entitled).map((module) => module.label).join(" · ")}</span> : null}
      </article>
      <form action={supportModuleAction} className={styles.supportCard}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="idempotencyKey" value={`support-module:${randomUUID()}`} />
        <label>Módulo<select className={styles.field} name="moduleKey" defaultValue="deliveries">{config.modules.map((module) => <option key={module.key} value={module.key}>{module.label} · {module.enabled ? "ativo" : module.entitled ? "inativo" : "fora do plano"}</option>)}</select></label>
        <label>Ação<select className={styles.field} name="enabled" defaultValue="true"><option value="true">Ativar</option><option value="false">Desativar</option></select></label>
        <label>Motivo da intervenção<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: configuração confirmada pelo responsável da unidade" /></label>
        <label>Protocolo/chamado<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: SUP-2026-001" /></label>
        <button className={styles.button}>Pré-validar e aplicar alteração</button>
      </form>
    </div>
  </section>;
}
