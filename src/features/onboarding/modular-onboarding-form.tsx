"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bootstrapOrganizationAction } from "@/features/onboarding/actions";
import {
  BUSINESS_TYPES,
  CORE_MODULE_KEYS,
  MODULE_CATALOG,
  MODULE_KEYS,
  moduleLabel,
  modulesForPreset,
  type BusinessType,
  type ModuleKey,
  type ModulePreset,
} from "@/modules/module-catalog";
import { businessVocabulary } from "@/modules/business-vocabulary";

const businessDescription: Record<BusinessType, string> = {
  restaurant: "Cardápio, pedidos e ferramentas próprias para restaurante ou lanchonete.",
  gas: "Catálogo, pedidos e entregas para uma revenda de gás.",
  generic_commerce: "Uma base neutra para outros tipos de comércio.",
};

const presetDescription: Record<Exclude<ModulePreset, "custom">, string> = {
  essential: "Só o necessário para começar com uma operação mais simples.",
  complete: "Conjunto recomendado de ferramentas para o seu tipo de negócio.",
};

export function ModularOnboardingForm() {
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("restaurant");
  const [preset, setPreset] = useState<ModulePreset>("essential");
  const [customModules, setCustomModules] = useState<ModuleKey[]>([]);
  const vocabulary = businessVocabulary(businessType);
  const enabledModules = useMemo(
    () => modulesForPreset(businessType, preset, customModules),
    [businessType, customModules, preset],
  );
  const selectableModules = MODULE_KEYS.filter((key) => MODULE_CATALOG[key].supportedBusinessTypes.includes(businessType));

  function toggleCustomModule(key: ModuleKey) {
    if (CORE_MODULE_KEYS.includes(key)) return;
    setCustomModules((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]);
  }

  return (
    <form action={bootstrapOrganizationAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="organizationName" value={organizationName} />
      <input type="hidden" name="storeName" value={storeName} />
      <input type="hidden" name="businessType" value={businessType} />
      <input type="hidden" name="preset" value={preset} />
      {preset === "custom" ? enabledModules.map((key) => <input key={key} type="hidden" name="modules" value={key} />) : null}

      <div className="muted" aria-live="polite">Etapa {step + 1} de 5</div>

      {step === 0 ? <div style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Como se chama sua empresa?</h2>
        <Input label="Nome da empresa" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required maxLength={120} placeholder="Ex.: Central do Bairro" />
      </div> : null}

      {step === 1 ? <div style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Qual é o nome da primeira unidade?</h2>
        <Input label="Nome da unidade" value={storeName} onChange={(event) => setStoreName(event.target.value)} required maxLength={120} placeholder="Ex.: Loja Centro" />
      </div> : null}

      {step === 2 ? <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
        <legend><h2 style={{ margin: 0 }}>Qual é o seu tipo de negócio?</h2></legend>
        {BUSINESS_TYPES.map((type) => {
          const copy = businessVocabulary(type);
          return <label key={type} className="card" style={{ padding: 16, display: "grid", gap: 4, cursor: "pointer" }}>
            <span><input type="radio" name="business-choice" checked={businessType === type} onChange={() => { setBusinessType(type); setCustomModules([]); }} /> <strong>{copy.businessLabel}</strong></span>
            <span className="muted">{businessDescription[type]}</span>
          </label>;
        })}
      </fieldset> : null}

      {step === 3 ? <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
        <legend><h2 style={{ margin: 0 }}>Como você quer começar?</h2></legend>
        {(["essential", "complete", "custom"] as const).map((mode) => <label key={mode} className="card" style={{ padding: 16, display: "grid", gap: 4, cursor: "pointer" }}>
          <span><input type="radio" name="preset-choice" checked={preset === mode} onChange={() => setPreset(mode)} /> <strong>{mode === "essential" ? "Essencial" : mode === "complete" ? "Completo" : "Personalizar"}</strong></span>
          <span className="muted">{mode === "custom" ? "Escolha somente as ferramentas que fazem sentido. O núcleo necessário permanece ligado." : presetDescription[mode]}</span>
        </label>)}
      </fieldset> : null}

      {step === 4 ? <div style={{ display: "grid", gap: 14 }}>
        <div><h2 style={{ marginBottom: 6 }}>Confira antes de criar</h2><p className="muted" style={{ margin: 0 }}>{organizationName} · {storeName} · {vocabulary.businessLabel}</p></div>
        {preset === "custom" ? <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend><strong>Escolha suas ferramentas</strong></legend>
          {selectableModules.map((key) => {
            const core = CORE_MODULE_KEYS.includes(key);
            const checked = enabledModules.includes(key);
            return <label key={key} className="card" style={{ padding: 12, display: "grid", gap: 3 }}>
              <span><input type="checkbox" checked={checked} disabled={core} onChange={() => toggleCustomModule(key)} /> <strong>{moduleLabel(key, businessType)}</strong>{core ? " · Essencial" : ""}</span>
              <span className="muted">{MODULE_CATALOG[key].description}</span>
            </label>;
          })}
        </fieldset> : <div className="card" style={{ padding: 16 }}><strong>{preset === "essential" ? "Essencial" : "Completo"}</strong><p className="muted">Serão habilitadas {enabledModules.length} ferramentas adequadas ao perfil. Você poderá mudar módulos depois em Configurações.</p></div>}
        <div className="card" style={{ padding: 16 }}><strong>Ferramentas iniciais</strong><p style={{ marginBottom: 0 }}>{enabledModules.map((key) => moduleLabel(key, businessType)).join(" · ")}</p></div>
      </div> : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {step > 0 ? <Button type="button" tone="secondary" onClick={() => setStep((value) => value - 1)}>Voltar</Button> : <span />}
        {step < 4 ? <Button type="button" onClick={() => setStep((value) => value + 1)} disabled={(step === 0 && organizationName.trim().length < 2) || (step === 1 && storeName.trim().length < 2)}>Continuar</Button> : <Button type="submit" size="lg">Criar e começar</Button>}
      </div>
    </form>
  );
}
