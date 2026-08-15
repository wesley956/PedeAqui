"use client";

import { useDeferredValue, useMemo, useState } from "react";
import styles from "./platform.module.css";

export type PlatformOrganizationCard = {
  id: string;
  name: string;
  organizationStatus: string;
  subscriptionStatus: string;
  subscriptionLabel: string;
  planName: string;
  createdLabel: string;
  tone: "good" | "warn" | "danger" | "neutral";
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function OrganizationSearch({ organizations }: { organizations: PlatformOrganizationCard[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const needle = normalize(deferredQuery.trim());
    if (!needle) return organizations;
    return organizations.filter((item) => normalize(`${item.name} ${item.planName} ${item.subscriptionLabel}`).includes(needle));
  }, [deferredQuery, organizations]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        className={styles.search}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar empresa ou plano"
        aria-label="Buscar empresa no PedeAqui"
      />
      <div className={styles.orgGrid}>
        {filtered.map((organization) => (
          <article key={organization.id} className={styles.orgCard}>
            <div className={styles.cardTop}>
              <strong>{organization.name}</strong>
              <span className={styles.pill} data-tone={organization.tone}>{organization.subscriptionLabel}</span>
            </div>
            <span className={styles.meta}>Plano: {organization.planName}</span>
            <span className={styles.meta}>Empresa: {organization.organizationStatus} · cadastrada em {organization.createdLabel}</span>
          </article>
        ))}
      </div>
      {filtered.length === 0 ? <div className={styles.empty}>Nenhuma empresa encontrada para esta busca.</div> : null}
    </div>
  );
}
