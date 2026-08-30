"use client";

import { useActionState, useMemo, useState } from "react";
import { applyCommercialCompositionAction, type CommercialComposerActionState } from "@/features/platform-commercial-composer/actions";

type ModuleKey = string;
type CommercialMode = "package" | "package_plus_addons" | "custom";

type OrganizationOption = {
  id: string;
  name: string;
  eligible: boolean;
  eligibilityReason: string | null;
  store: { id: string; name: string; businessType: string; moduleRevision: number; modulePreset: string } | null;
  subscription: { price_locked?: boolean | null; founder_slot?: number | null } | null;
};

type PlanOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number | null;
  currency: string;
  includedModules: ModuleKey[];
  custom: boolean;
};

type ModuleOption = {
  key: ModuleKey;
  name: string;
  kind: "core" | "optional" | "segmented";
  dependencies: ModuleKey[];
  sellable: boolean;
  priceCents: number | null;
};

const initialState: CommercialComposerActionState = { ok: false, message: "" };
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CommercialApplyForm({ organizations, plans, modules }: { organizations: OrganizationOption[]; plans: PlanOption[]; modules: ModuleOption[] }) {
  const [state, formAction, pending] = useActionState(applyCommercialCompositionAction, initialState);
  const [organizationId, setOrganizationId] = useState(organizations.find((item) => item.eligible)?.id ?? "");
  const [mode, setMode] = useState<CommercialMode>("package");
  const publicPlans = useMemo(() => plans.filter((plan) => plan.key !== "founders"), [plans]);
  const packagePlans = useMemo(() => publicPlans.filter((plan) => !plan.custom), [publicPlans]);
  const customPlan = useMemo(() => publicPlans.find((plan) => plan.custom) ?? null, [publicPlans]);
  const [packagePlanId, setPackagePlanId] = useState(packagePlans[0]?.id ?? "");
  const [selectedExtras, setSelectedExtras] = useState<Set<ModuleKey>>(new Set());

  const organization = organizations.find((item) => item.id === organizationId) ?? null;
  const plan = mode === "custom" ? customPlan : packagePlans.find((item) => item.id === packagePlanId) ?? null;
  const moduleByKey = useMemo(() => new Map(modules.map((item) => [item.key, item])), [modules]);
  const included = useMemo(() => new Set(plan?.includedModules ?? []), [plan]);

  const effectiveExtras = useMemo(() => {
    const result = new Set<ModuleKey>();
    const visit = (key: ModuleKey) => {
      if (included.has(key) || result.has(key)) return;
      const definition = moduleByKey.get(key);
      if (!definition) return;
      result.add(key);
      for (const dependency of definition.dependencies) visit(dependency);
    };
    for (const key of selectedExtras) visit(key);
    return result;
  }, [included, moduleByKey, selectedExtras]);

  const extraTotal = [...effectiveExtras].reduce((sum, key) => sum + (moduleByKey.get(key)?.priceCents ?? 0), 0);
  const basePrice = plan?.monthlyPriceCents ?? 0;
  const totalPrice = basePrice + extraTotal;
  const sellableModules = modules.filter((module) => module.kind !== "core" && module.sellable);

  function changeMode(nextMode: CommercialMode) {
    setMode(nextMode);
    setSelectedExtras(new Set());
  }

  function toggleExtra(key: ModuleKey) {
    setSelectedExtras((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <div style={gridStyle}>
        <label style={labelStyle}>Cliente
          <select name="organizationId" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setSelectedExtras(new Set()); }} style={fieldStyle} required>
            <option value="">Selecione…</option>
            {organizations.map((item) => <option key={item.id} value={item.id} disabled={!item.eligible}>{item.name}{item.eligible ? "" : " · indisponível na v1"}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Modalidade
          <select name="mode" value={mode} onChange={(event) => changeMode(event.target.value as CommercialMode)} style={fieldStyle}>
            <option value="package">Pacote pronto</option>
            <option value="package_plus_addons">Pacote + módulos</option>
            <option value="custom">Monte seu plano</option>
          </select>
        </label>
        {mode === "custom" ? (
          <label style={labelStyle}>Plano-base
            <input value={customPlan ? `${customPlan.name} · ${money(customPlan.monthlyPriceCents ?? 0)}` : "Plano personalizado indisponível"} readOnly style={fieldStyle} />
          </label>
        ) : (
          <label style={labelStyle}>Pacote
            <select value={packagePlanId} onChange={(event) => { setPackagePlanId(event.target.value); setSelectedExtras(new Set()); }} style={fieldStyle}>
              {packagePlans.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.monthlyPriceCents ?? 0)}</option>)}
            </select>
          </label>
        )}
        <label style={labelStyle}>Dia do vencimento
          <input name="billingDueDay" type="number" min={1} max={28} inputMode="numeric" placeholder="Ex.: 10" style={fieldStyle} />
        </label>
        <label style={labelStyle}>Primeiro vencimento
          <input name="nextDueDate" type="date" style={fieldStyle} />
        </label>
      </div>

      <input type="hidden" name="storeId" value={organization?.store?.id ?? ""} />
      <input type="hidden" name="planId" value={plan?.id ?? ""} />
      <input type="hidden" name="expectedModuleRevision" value={organization?.store?.moduleRevision ?? ""} />

      {organization && !organization.eligible ? <div style={warningStyle}>{organization.eligibilityReason}</div> : null}
      {organization?.subscription?.founder_slot ? <div style={warningStyle}><strong>Contrato Fundador detectado.</strong> O compositor normal não deve substituir o preço protegido. Use o fluxo dedicado caso algum dia exista uma alteração contratual aprovada.</div> : null}

      <div style={{ display: "grid", gap: 10 }}>
        <strong>Módulos da proposta</strong>
        {(plan?.includedModules ?? []).length ? <div style={moduleBoxStyle}><span><strong>Incluídos no plano</strong><small style={mutedStyle}>{plan?.includedModules.map((key) => moduleByKey.get(key)?.name ?? key).join(", ")}</small></span><strong>{money(basePrice)}</strong></div> : null}
        {mode !== "package" ? sellableModules.map((module) => {
          const directlySelected = selectedExtras.has(module.key);
          const effective = effectiveExtras.has(module.key);
          const forcedByDependency = effective && !directlySelected;
          return (
            <div key={module.key} style={{ ...moduleBoxStyle, opacity: effective || directlySelected ? 1 : .78 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={directlySelected} onChange={() => toggleExtra(module.key)} disabled={included.has(module.key)} />
                <span><strong>{module.name}</strong><small style={mutedStyle}>{forcedByDependency ? "Incluído automaticamente por dependência" : module.dependencies.length ? `Depende de ${module.dependencies.map((key) => moduleByKey.get(key)?.name ?? key).join(", ")}` : "Módulo adicional"}</small></span>
              </label>
              <strong>{money(module.priceCents ?? 0)}/mês</strong>
            </div>
          );
        }) : null}
      </div>

      {[...selectedExtras].map((key) => <input key={`module:${key}`} type="hidden" name="module" value={key} />)}
      {[...effectiveExtras].map((key) => <input key={`price:${key}`} type="hidden" name={`price.${key}`} value={moduleByKey.get(key)?.priceCents ?? 0} />)}

      <div style={summaryStyle}>
        <span><strong>{plan?.name ?? "Selecione um plano"}</strong><small style={mutedStyle}>{mode === "package" ? "Pacote fechado" : `${effectiveExtras.size} módulo(s) adicional(is)`}</small></span>
        <span style={{ textAlign: "right" }}><small style={mutedStyle}>Mensalidade calculada</small><strong style={{ display: "block", fontSize: 26 }}>{money(totalPrice)}</strong></span>
      </div>

      <div style={gridStyle}>
        <label style={labelStyle}>Motivo administrativo
          <input name="reason" defaultValue="Composição comercial aplicada pelo ADM" minLength={5} maxLength={500} style={fieldStyle} />
        </label>
        <label style={labelStyle}>Protocolo
          <input name="protocol" defaultValue={`PA-COMPOSER-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`} minLength={3} maxLength={120} style={fieldStyle} />
        </label>
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}><input type="checkbox" name="priceLocked" value="on" /> Proteger este valor no contrato</label>
      <label style={labelStyle}>Motivo da proteção de preço
        <input name="priceLockReason" placeholder="Obrigatório se marcar proteção" style={fieldStyle} />
      </label>

      {state.message ? <div style={state.ok ? successStyle : errorStyle}>{state.message}{state.ok && typeof state.totalPriceCents === "number" ? ` Total: ${money(state.totalPriceCents)}.` : ""}</div> : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <small style={mutedStyle}>A aplicação é transacional: contrato e módulos só ficam gravados se todas as validações passarem.</small>
        <button type="submit" disabled={pending || !organization?.eligible || !plan || Boolean(organization?.subscription?.founder_slot)} style={buttonStyle}>{pending ? "Aplicando…" : "Aplicar composição"}</button>
      </div>
    </form>
  );
}

const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 } as const;
const labelStyle = { display: "grid", gap: 6, fontWeight: 800 } as const;
const fieldStyle = { width: "100%", minHeight: 42, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", padding: "8px 10px", font: "inherit" } as const;
const mutedStyle = { display: "block", marginTop: 3, color: "var(--muted)", lineHeight: 1.45 } as const;
const moduleBoxStyle = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" } as const;
const summaryStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", padding: 16, border: "1px solid color-mix(in srgb,var(--accent) 32%,var(--border))", borderRadius: 14, background: "color-mix(in srgb,var(--accent) 8%,var(--surface))" } as const;
const warningStyle = { padding: 12, borderRadius: 12, border: "1px solid #a96b12", background: "color-mix(in srgb,#a96b12 12%,var(--surface))", lineHeight: 1.5 } as const;
const successStyle = { padding: 12, borderRadius: 12, border: "1px solid #318454", background: "color-mix(in srgb,#318454 10%,var(--surface))" } as const;
const errorStyle = { padding: 12, borderRadius: 12, border: "1px solid #a83d3d", background: "color-mix(in srgb,#a83d3d 10%,var(--surface))" } as const;
const buttonStyle = { minHeight: 44, border: 0, borderRadius: 10, padding: "10px 16px", background: "var(--accent)", color: "white", fontWeight: 900, cursor: "pointer" } as const;
