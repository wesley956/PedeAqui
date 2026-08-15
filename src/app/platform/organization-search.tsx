"use client";

import Link from "next/link";
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

export type PlatformUnitCard = {
  id: string;
  name: string;
  organizationName: string;
  statusLabel: string;
  locationLabel: string;
  recentOrders: number;
  lastOrderLabel: string;
  tone: "good" | "warn" | "danger" | "neutral";
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function OrganizationSearch({ organizations, units }: { organizations: PlatformOrganizationCard[]; units: PlatformUnitCard[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const needle = normalize(deferredQuery.trim());
  const filteredOrganizations = useMemo(() => {
    if (!needle) return organizations;
    return organizations.filter((item) => normalize(`${item.name} ${item.planName} ${item.subscriptionLabel}`).includes(needle));
  }, [needle, organizations]);
  const filteredUnits = useMemo(() => {
    if (!needle) return units;
    return units.filter((item) => normalize(`${item.name} ${item.organizationName} ${item.statusLabel} ${item.locationLabel}`).includes(needle));
  }, [needle, units]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        className={styles.search}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar empresa, unidade ou plano"
        aria-label="Buscar empresa ou unidade no PedeAqui"
      />

      <div className={styles.searchGroup}>
        <div className={styles.searchGroupTitle}><strong>Empresas</strong><span>{filteredOrganizations.length}</span></div>
        <div className={styles.orgGrid}>
          {filteredOrganizations.map((organization) => (
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
        {filteredOrganizations.length === 0 ? <div className={styles.empty}>Nenhuma empresa encontrada.</div> : null}
      </div>

      <div className={styles.searchGroup}>
        <div className={styles.searchGroupTitle}><strong>Unidades</strong><span>{filteredUnits.length}</span></div>
        <div className={styles.orgGrid}>
          {filteredUnits.map((unit) => (
            <Link key={unit.id} className={styles.orgCardLink} href={`/platform/unidades/${unit.id}`}>
              <article className={styles.orgCard}>
                <div className={styles.cardTop}>
                  <strong>{unit.name}</strong>
                  <span className={styles.pill} data-tone={unit.tone}>{unit.statusLabel}</span>
                </div>
                <span className={styles.meta}>{unit.organizationName}</span>
                <span className={styles.meta}>{unit.locationLabel}</span>
                <span className={styles.meta}>{unit.recentOrders > 0 ? `Atividade recente detectada · ${unit.lastOrderLabel}` : unit.lastOrderLabel}</span>
                <span className={styles.open360}>Abrir visão 360° →</span>
              </article>
            </Link>
          ))}
        </div>
        {filteredUnits.length === 0 ? <div className={styles.empty}>Nenhuma unidade encontrada.</div> : null}
      </div>
    </div>
  );
}
