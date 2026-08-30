import { savePlatformSettingAction } from "@/features/platform-governance/actions";
import { PlatformGovernanceService } from "@/server/platform/platform-governance-service";
import styles from "../platform.module.css";

function displayValue(value: unknown){
  if(typeof value==="string"||typeof value==="number"||typeof value==="boolean") return String(value);
  try{return JSON.stringify(value)}catch{return "—"}
}
function valueType(value: unknown){ if(typeof value==="boolean")return "boolean"; if(typeof value==="number")return "number"; if(value&&typeof value==="object")return "json"; return "string"; }

export default async function PlatformConfiguracoesPage(){
  const data=await PlatformGovernanceService.loadSettingsAndPrivacy();
  return <div className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>SUPORTE E PLATAFORMA · CONFIGURAÇÕES</p><h1>Defaults globais do PedeAqui</h1><p>Somente regras não secretas ficam aqui. Tokens, credenciais e chaves de integração continuam exclusivamente em variáveis de ambiente/Vault.</p></div><span className={styles.roleBadge}>{data.settings.length} configuração(ões)</span></header>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Configurações atuais</h2><p>Alterações entram na auditoria global e não reescrevem contratos históricos.</p></div></div>
      <div className={styles.featureList}>{data.settings.map((setting)=><details className={styles.details} key={setting.key}><summary>{setting.key} · {displayValue(setting.value)}</summary><div className={styles.detailsBody}><p className={styles.advancedNote}>{setting.description}</p><form action={savePlatformSettingAction} className={styles.formGrid}><input type="hidden" name="key" value={setting.key}/><input type="hidden" name="category" value={setting.category}/><input type="hidden" name="description" value={setting.description}/><select className={styles.field} name="valueType" defaultValue={valueType(setting.value)}><option value="string">Texto</option><option value="number">Número</option><option value="boolean">Booleano</option><option value="json">JSON</option></select><input className={styles.field} name="value" defaultValue={displayValue(setting.value)} required/><select className={styles.field} name="active" defaultValue={setting.active?"true":"false"}><option value="true">Ativa</option><option value="false">Inativa</option></select><button className={styles.button}>Salvar configuração</button></form></div></details>)}</div>
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Travas deliberadas</h2><p>Configurações abaixo permanecem desligadas até decisão explícita.</p></div></div>
      <div className={styles.supportGrid}><Card title="Cashback Fundadores" text="Conversão em dinheiro continua bloqueada por padrão até revisão fiscal/contábil."/><Card title="PedeCoins automáticos" text="Nenhum ponto é gerado automaticamente enquanto regras de ganho e expiração não forem aprovadas."/><Card title="Segredos" text="Credenciais Mercado Pago, WhatsApp e Supabase nunca são editadas por esta tela."/></div>
    </section>
  </div>;
}
function Card({title,text}:{title:string;text:string}){return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>}
