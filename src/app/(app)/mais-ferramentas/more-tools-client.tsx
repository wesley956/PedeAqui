"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NavigationGroup } from "@/components/layout/navigation-model";
import styles from "./more-tools.module.css";
import { NavigationIcon } from "@/components/ui/navigation-icon";

export type MoreToolItem = {
  key: string;
  label: string;
  href: string;
  group: NavigationGroup;
};

const groupMeta: readonly { key: NavigationGroup; label: string; description: string }[] = [
  { key: "operation", label: "Operação", description: "Ferramentas usadas para tocar pedidos e atendimento." },
  { key: "relationship", label: "Clientes e vendas", description: "Relacionamento, atendimento e crescimento." },
  { key: "supplies", label: "Estoque e compras", description: "Reposição, fornecedores e controle de insumos." },
  { key: "management", label: "Gestão", description: "Indicadores e controles administrativos." },
  { key: "administration", label: "Equipe e administração", description: "Pessoas, estrutura e configurações avançadas." },
];

export function MoreToolsClient({ items }: { items: readonly MoreToolItem[] }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = useMemo(() => normalized ? items.filter((item) => item.label.toLocaleLowerCase("pt-BR").includes(normalized)) : items, [items, normalized]);

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><h1>Mais ferramentas</h1><p>As funções menos usadas ficam organizadas aqui, sem atrapalhar o dia a dia.</p></div>
      <span className={styles.badge}>Só o que você pode usar</span>
    </header>

    <label className={styles.search}>
      <span aria-hidden>⌕</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar ferramenta: estoque, cliente, fornecedor..." />
    </label>

    {groupMeta.map((group) => {
      const groupItems = filtered.filter((item) => item.group === group.key);
      if (groupItems.length === 0) return null;
      return <section className={styles.group} key={group.key} aria-labelledby={`more-tools-${group.key}`}>
        <div className={styles.groupHeader}><h2 id={`more-tools-${group.key}`}>{group.label}</h2><p>{group.description}</p></div>
        <div className={styles.grid}>{groupItems.map((item) => <Link href={item.href} className={styles.card} key={item.key}>
          <span className={styles.icon} aria-hidden><NavigationIcon name={item.key} width={20} height={20} /></span>
          <span><strong>{item.label}</strong><small>Abrir ferramenta</small></span>
          <em aria-hidden>→</em>
        </Link>)}</div>
      </section>;
    })}

    {filtered.length === 0 ? <div className={styles.empty}><strong>Nenhuma ferramenta encontrada</strong><span>Tente outro nome ou confira se o recurso está disponível para sua função.</span></div> : null}
  </section>;
}
