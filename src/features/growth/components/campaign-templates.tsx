"use client";

import { useActionState, useState } from "react";
import { submitCampaignTemplateAction } from "@/features/growth/actions";
import type { CampaignTemplate } from "@/server/growth/campaign-template-model";
import styles from "@/app/(app)/crescimento/growth.module.css";

const statuses: Record<string, string> = { APPROVED: "Aprovado", PENDING: "Em análise", REJECTED: "Rejeitado", PAUSED: "Pausado", DISABLED: "Desativado" };

export function CampaignTemplatePanel({ templates, error }: { templates: CampaignTemplate[]; error: string | null }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [result, submit, pending] = useActionState(submitCampaignTemplateAction, { message: "", success: false });
  return <section className={styles.section}>
    <div className={styles.sectionHeader}><div><h2>Mensagens da sua loja</h2><p>Crie o texto da campanha e envie o modelo para análise. A aprovação não dispara mensagens para clientes.</p></div><a className={styles.secondary} href="/crescimento/campanhas">Consultar status</a></div>
    {error ? <p role="alert">{error}</p> : null}
    <form action={submit} className={styles.detailsBody}>
      <label className={styles.label}>Nome do modelo<input name="templateModelName" value={name} onChange={event => setName(event.target.value)} className={styles.field} required pattern="[a-z0-9_]+" maxLength={512} placeholder="promocao_semana_v1" /></label>
      <label className={styles.label}>Mensagem em português<textarea name="templateBody" value={body} onChange={event => setBody(event.target.value)} className={`${styles.field} ${styles.textarea}`} required minLength={10} maxLength={1024} /></label>
      <p>Use <code>{"{{1}}"}</code> se quiser incluir o nome do cliente. Esta versão aceita texto sem imagens ou botões. Inclua as condições e a validade da oferta no texto.</p>
      <button type="submit" className={styles.primary} disabled={pending || !!error}>{pending ? "Enviando para análise…" : "Enviar modelo para análise"}</button>
      {result.message ? <p role="status">{result.message}</p> : null}
    </form>
    <div className={styles.list}>{templates.filter(t => t.category === "MARKETING").map(template => <article className={styles.item} key={`${template.name}:${template.language}`}><div className={styles.itemMain}><strong>{template.name} · {statuses[template.status] ?? template.status}</strong><span className={styles.itemMeta}>{template.language}{!template.supported ? " · formato ainda não disponível nas campanhas" : ""}</span><p style={{ whiteSpace: "pre-wrap" }}>{template.bodyText}</p></div></article>)}</div>
  </section>;
}

export function CampaignTemplateSelection({ templates, selectedName, selectedLanguage }: { templates: CampaignTemplate[]; selectedName?: string | null; selectedLanguage?: string }) {
  const available = templates.filter(t => t.status === "APPROVED" && t.category === "MARKETING" && t.supported);
  const [key, setKey] = useState(selectedName ? `${selectedName}:${selectedLanguage}` : "");
  const selected = available.find(t => `${t.name}:${t.language}` === key);
  return <div className={styles.detailsBody}>
    <label className={styles.label}>Mensagem aprovada<select className={styles.field} value={selected ? key : ""} onChange={event => setKey(event.target.value)} required><option value="">Selecione uma mensagem aprovada</option>{available.map(template => <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>{template.name} · {template.language}</option>)}</select></label>
    <input type="hidden" name="templateName" value={selected?.name ?? ""} />
    <input type="hidden" name="templateLanguage" value={selected?.language ?? "pt_BR"} />
    <input type="hidden" name="includeCustomerNameParameter" value={selected?.usesCustomerName ? "on" : ""} />
    <input type="hidden" name="content" value={selected?.bodyText ?? ""} />
    {selectedName && !selected ? <p>A mensagem desta campanha não está disponível como modelo aprovado. Selecione um modelo antes de salvar uma nova versão.</p> : null}
    {selected ? <p style={{ whiteSpace: "pre-wrap" }}>{selected.bodyText}</p> : <p>Crie um modelo acima ou consulte novamente após a aprovação.</p>}
  </div>;
}
