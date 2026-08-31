"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bootstrapOrganizationAction } from "@/features/onboarding/actions";
import { BUSINESS_TYPES, type BusinessType } from "@/modules/module-catalog";
import { businessVocabulary } from "@/modules/business-vocabulary";

const businessDescription: Record<BusinessType, string> = {
  restaurant: "Cardápio, pedidos e ferramentas próprias para restaurante ou lanchonete.",
  gas: "Catálogo, pedidos e entregas para uma revenda de gás.",
  generic_commerce: "Uma base neutra para outros tipos de comércio.",
};

type PlanOption = { key: string; name: string; monthlyPriceCents: number };

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function ModularOnboardingForm({ plans, initialPlanKey, trialDays }: { plans: PlanOption[]; initialPlanKey?: string; trialDays: number }) {
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("restaurant");
  const [planKey, setPlanKey] = useState(initialPlanKey ?? plans[0]?.key ?? "");
  const vocabulary = businessVocabulary(businessType);
  const selectedPlan = plans.find((plan) => plan.key === planKey);

  return (
    <form action={bootstrapOrganizationAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="organizationName" value={organizationName} />
      <input type="hidden" name="storeName" value={storeName} />
      <input type="hidden" name="businessType" value={businessType} />
      <input type="hidden" name="planKey" value={planKey} />
      <div className="muted" aria-live="polite">Etapa {step + 1} de 5</div>

      {step === 0 ? <div style={{ display: "grid", gap: 12 }}><h2 style={{ margin: 0 }}>Como se chama sua empresa?</h2><Input label="Nome da empresa" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required maxLength={120} /></div> : null}
      {step === 1 ? <div style={{ display: "grid", gap: 12 }}><h2 style={{ margin: 0 }}>Qual é o nome da primeira unidade?</h2><Input label="Nome da unidade" value={storeName} onChange={(e) => setStoreName(e.target.value)} required maxLength={120} /></div> : null}
      {step === 2 ? <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}><legend><h2 style={{ margin: 0 }}>Qual é o seu tipo de negócio?</h2></legend>{BUSINESS_TYPES.map((type) => { const copy = businessVocabulary(type); return <label key={type} className="card" style={{ padding: 16, display: "grid", gap: 4, cursor: "pointer" }}><span><input type="radio" checked={businessType === type} onChange={() => setBusinessType(type)} /> <strong>{copy.businessLabel}</strong></span><span className="muted">{businessDescription[type]}</span></label>; })}</fieldset> : null}
      {step === 3 ? <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}><legend><h2 style={{ margin: 0 }}>Confirme seu plano</h2></legend>{plans.map((plan) => <label key={plan.key} className="card" style={{ padding: 16, display: "grid", gap: 4, cursor: "pointer" }}><span><input type="radio" checked={planKey === plan.key} onChange={() => setPlanKey(plan.key)} /> <strong>{plan.name}</strong></span><span className="muted">{money(plan.monthlyPriceCents)}/mês após {trialDays} dias grátis.</span></label>)}</fieldset> : null}
      {step === 4 ? <div style={{ display: "grid", gap: 14 }}><div><h2 style={{ marginBottom: 6 }}>Confira antes de criar</h2><p className="muted" style={{ margin: 0 }}>{organizationName} · {storeName} · {vocabulary.businessLabel}</p></div><div className="card" style={{ padding: 16 }}><strong>Plano {selectedPlan?.name}</strong><p className="muted" style={{ marginBottom: 0 }}>{trialDays} dias grátis. Depois, {selectedPlan ? money(selectedPlan.monthlyPriceCents) : "—"}/mês. Os módulos incluídos serão liberados automaticamente pelo plano; módulos extras só entram após solicitação e aprovação.</p></div></div> : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {step > 0 ? <Button type="button" tone="secondary" onClick={() => setStep((v) => v - 1)}>Voltar</Button> : <span />}
        {step < 4 ? <Button type="button" onClick={() => setStep((v) => v + 1)} disabled={(step === 0 && organizationName.trim().length < 2) || (step === 1 && storeName.trim().length < 2) || (step === 3 && !planKey)}>Continuar</Button> : <Button type="submit" size="lg">Criar e começar teste</Button>}
      </div>
    </form>
  );
}
