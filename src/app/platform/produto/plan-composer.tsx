"use client";

import { useMemo, useState } from "react";

type BusinessType = "restaurant" | "gas" | "generic_commerce";
type ModuleKind = "core" | "optional" | "segmented";

type ComposerModule = {
  key: string;
  label: string;
  description: string;
  group: string;
  kind: ModuleKind;
  dependencies: string[];
  supportedBusinessTypes: BusinessType[];
};

const businessLabels: Record<BusinessType, string> = {
  restaurant: "Restaurante / delivery",
  gas: "Revenda de gás",
  generic_commerce: "Comércio",
};

const groupLabels: Record<string, string> = {
  operation: "Operação",
  management: "Gestão",
  supplies: "Suprimentos",
  relationship: "Relacionamento",
  administration: "Administração",
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function numberFromMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function PlanComposer({ modules }: { modules: ComposerModule[] }) {
  const [businessType, setBusinessType] = useState<BusinessType>("restaurant");
  const [basePrice, setBasePrice] = useState("0.00");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(modules.filter((item) => item.kind === "core" && item.supportedBusinessTypes.includes("restaurant")).map((item) => item.key)));
  const [prices, setPrices] = useState<Record<string, string>>({});

  const available = useMemo(() => modules.filter((item) => item.supportedBusinessTypes.includes(businessType)), [businessType, modules]);
  const moduleByKey = useMemo(() => new Map(modules.map((item) => [item.key, item])), [modules]);

  function dependenciesFor(key: string, target: Set<string>) {
    const item = moduleByKey.get(key);
    if (!item || !item.supportedBusinessTypes.includes(businessType)) return;
    target.add(key);
    for (const dependency of item.dependencies) dependenciesFor(dependency, target);
  }

  function selectBusiness(nextBusinessType: BusinessType) {
    setBusinessType(nextBusinessType);
    const next = new Set<string>();
    for (const item of modules) {
      if (item.kind === "core" && item.supportedBusinessTypes.includes(nextBusinessType)) next.add(item.key);
    }
    setSelected(next);
  }

  function toggle(key: string) {
    const item = moduleByKey.get(key);
    if (!item || item.kind === "core") return;
    setSelected((current) => {
      const next = new Set(current);
      if (!next.has(key)) {
        dependenciesFor(key, next);
        return next;
      }

      next.delete(key);
      let changed = true;
      while (changed) {
        changed = false;
        for (const selectedKey of [...next]) {
          const selectedModule = moduleByKey.get(selectedKey);
          if (selectedModule?.kind !== "core" && selectedModule?.dependencies.some((dependency) => !next.has(dependency))) {
            next.delete(selectedKey);
            changed = true;
          }
        }
      }
      return next;
    });
  }

  const optionalTotal = available
    .filter((item) => selected.has(item.key) && item.kind !== "core")
    .reduce((sum, item) => sum + numberFromMoneyInput(prices[item.key] ?? "0"), 0);
  const total = numberFromMoneyInput(basePrice) + optionalTotal;
  const selectedModules = available.filter((item) => selected.has(item.key));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
        <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
          Tipo de negócio
          <select value={businessType} onChange={(event) => selectBusiness(event.target.value as BusinessType)} style={fieldStyle}>
            {(Object.keys(businessLabels) as BusinessType[]).map((key) => <option value={key} key={key}>{businessLabels[key]}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
          Mensalidade-base (R$)
          <input value={basePrice} onChange={(event) => setBasePrice(event.target.value)} inputMode="decimal" style={fieldStyle} aria-label="Mensalidade-base" />
        </label>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {available.map((item) => {
          const isSelected = selected.has(item.key);
          const isCore = item.kind === "core";
          return (
            <div key={item.key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(130px,180px)", gap: 12, alignItems: "center", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: isSelected ? "color-mix(in srgb,var(--accent) 7%,var(--surface-2))" : "var(--surface-2)" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: isCore ? "default" : "pointer" }}>
                <input type="checkbox" checked={isSelected} disabled={isCore} onChange={() => toggle(item.key)} style={{ marginTop: 4 }} />
                <span style={{ display: "grid", gap: 3 }}>
                  <strong>{item.label}{isCore ? " · base" : ""}</strong>
                  <small style={{ color: "var(--muted)", lineHeight: 1.45 }}>{item.description}</small>
                  <small style={{ color: "var(--muted)" }}>{groupLabels[item.group] ?? item.group}{item.dependencies.length ? ` · depende de ${item.dependencies.map((key) => moduleByKey.get(key)?.label ?? key).join(", ")}` : ""}</small>
                </span>
              </label>
              {isCore ? <strong style={{ textAlign: "right", fontSize: 12 }}>Incluído na base</strong> : (
                <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 800 }}>
                  Preço avulso (R$)
                  <input disabled={!isSelected} value={prices[item.key] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [item.key]: event.target.value }))} inputMode="decimal" placeholder="0,00" style={fieldStyle} />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", padding: 16, border: "1px solid color-mix(in srgb,var(--accent) 32%,var(--border))", borderRadius: 14, background: "color-mix(in srgb,var(--accent) 8%,var(--surface))" }}>
        <span style={{ display: "grid", gap: 2 }}>
          <strong>{selectedModules.length} módulo(s) na composição</strong>
          <small style={{ color: "var(--muted)" }}>Simulação comercial. Dependências são incluídas automaticamente.</small>
        </span>
        <span style={{ display: "grid", gap: 2, textAlign: "right" }}>
          <small style={{ color: "var(--muted)" }}>Valor mensal simulado</small>
          <strong style={{ fontSize: 26 }}>{money.format(total)}</strong>
        </span>
      </div>

      <p style={{ margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
        Este simulador não altera contrato, assinatura nem módulos de cliente real. A contratação continua passando por proposta, aceite e aplicação controlada em Assinaturas.
      </p>
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  minHeight: 42,
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--surface)",
  color: "var(--text)",
  padding: "8px 10px",
  font: "inherit",
} as const;
