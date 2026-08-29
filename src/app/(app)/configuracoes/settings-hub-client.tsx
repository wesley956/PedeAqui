"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./settings-hub.module.css";

export type SettingsHubItem = {
  title: string;
  description: string;
  href: string;
  available: boolean;
  activationHref?: string | null;
  keywords: string[];
};

export type SettingsHubArea = {
  key: string;
  icon: string;
  title: string;
  description: string;
  items: SettingsHubItem[];
};

function normalize(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function SettingsHubClient({ areas, canManageResources }: { areas: readonly SettingsHubArea[]; canManageResources: boolean }) {
  const [query, setQuery] = useState("");
  const normalized = normalize(query.trim());
  const filtered = useMemo(() => {
    if (!normalized) return areas;
    return areas.map((area) => {
      const areaMatches = normalize(`${area.title} ${area.description}`).includes(normalized);
      const items = area.items.filter((item) => areaMatches || normalize(`${item.title} ${item.description} ${item.keywords.join(" ")}`).includes(normalized));
      return { ...area, items };
    }).filter((area) => area.items.length > 0);
  }, [areas, normalized]);

  return <>
    <label className={styles.search}>
      <span aria-hidden>⌕</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="O que você quer configurar? Ex.: bairro, Pix, horário, WhatsApp..." />
    </label>

    <section className={styles.section} aria-labelledby="settings-main-title">
      <div className={styles.sectionHeader}><h2 id="settings-main-title">Configurações do restaurante</h2><p>Tudo organizado pelo que você quer fazer, não pelo nome técnico da função.</p></div>
      <div className={styles.grid}>
        {filtered.map((area) => <article className={styles.areaCard} key={area.key}>
          <span className={styles.areaIcon} aria-hidden>{area.icon}</span>
          <div className={styles.areaCopy}><strong>{area.title}</strong><span>{area.description}</span></div>
          <div className={styles.areaLinks}>{area.items.map((item) => item.available ? <Link href={item.href} key={item.href}>{item.title}<span aria-hidden>→</span></Link> : <div className={styles.unavailableRow} key={item.href}><span>{item.title}<small>Recurso não ativo</small></span>{canManageResources && item.activationHref ? <Link href={item.activationHref}>Ativar</Link> : <em>Indisponível</em>}</div>)}</div>
        </article>)}
        {!normalized && canManageResources ? <Link href="/configuracoes/modulos" className={`${styles.areaCard} ${styles.featuredCard}`}>
          <span className={styles.areaIcon} aria-hidden>✨</span>
          <div className={styles.areaCopy}><strong>Recursos do PedeAqui</strong><span>Ative novas funções somente quando seu negócio precisar.</span></div>
          <em className={styles.featuredAction}>Gerenciar recursos →</em>
        </Link> : null}
      </div>
      {filtered.length === 0 ? <div className={styles.empty}><strong>Não achei essa configuração</strong><span>Tente outro termo, como bairro, taxa, impressora, cartão ou funcionário.</span></div> : null}
    </section>
  </>;
}
