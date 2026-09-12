"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  createAutomationAction,
  createCampaignAction,
  createCouponAction,
  createSegmentAction,
  saveGrowthSettingsAction,
} from "@/features/growth/actions";
import styles from "./growth.module.css";

type ObjectiveKey = "return" | "promotion" | "loyalty" | "frequency" | "announcement" | "best";
type Draft = {
  preset: string; name: string; days: string; description: string; code: string;
  discountType: string; discountValue: string; minimumOrder: string;
  usageLimitPerCustomer: string; validDays: string; kind: string;
  cashbackRate: string; cashbackMinimum: string; cashbackExpiryDays: string;
  loyaltySpendPerPoint: string; loyaltyRedeemPerPoint: string; bonusPoints: string;
  minimumTotal: string; objective: string; content: string; criterion: string;
  ordersCount: string; totalSpent: string;
};

type Props = {
  settings: {
    cashbackEnabled: boolean;
    cashbackRate: string;
    cashbackMinimum: string;
    cashbackExpiryDays: string;
    loyaltyEnabled: boolean;
    loyaltySpendPerPoint: string;
    loyaltyRedeemPerPoint: string;
  };
};

const OBJECTIVES: Array<{ key: ObjectiveKey; title: string; description: string; action: string }> = [
  { key: "return", title: "Trazer clientes de volta", description: "Separe quem está há um tempo sem comprar e prepare a próxima ação.", action: "Criar grupo" },
  { key: "promotion", title: "Criar uma promoção", description: "Monte um cupom com desconto, validade e limites claros.", action: "Criar cupom" },
  { key: "loyalty", title: "Fidelizar clientes", description: "Ative cashback ou pontos sem precisar entender regras técnicas.", action: "Configurar fidelidade" },
  { key: "frequency", title: "Aumentar a frequência", description: "Premie automaticamente uma nova compra com pontos.", action: "Criar ação automática" },
  { key: "announcement", title: "Enviar campanha ou anúncio", description: "Crie um rascunho para divulgar promoção, novidade ou horário especial.", action: "Criar rascunho" },
  { key: "best", title: "Premiar melhores clientes", description: "Monte um grupo VIP por quantidade de pedidos ou valor gasto.", action: "Criar grupo VIP" },
];

const EMPTY_DRAFT: Draft = {
  preset: "", name: "", days: "", description: "", code: "", discountType: "percentage",
  discountValue: "", minimumOrder: "", usageLimitPerCustomer: "", validDays: "", kind: "cashback",
  cashbackRate: "", cashbackMinimum: "", cashbackExpiryDays: "", loyaltySpendPerPoint: "",
  loyaltyRedeemPerPoint: "", bonusPoints: "", minimumTotal: "", objective: "", content: "",
  criterion: "orders", ordersCount: "", totalSpent: "",
};

const INITIAL_DRAFTS: Record<ObjectiveKey, Draft> = {
  return: { ...EMPTY_DRAFT, preset: "inactive30", name: "Clientes inativos há 30 dias", days: "30", description: "Clientes que não compram há pelo menos 30 dias" },
  promotion: { ...EMPTY_DRAFT, preset: "return_coupon", code: "VOLTA10", name: "Cupom de retorno", discountType: "percentage", discountValue: "10", minimumOrder: "30,00", usageLimitPerCustomer: "1", validDays: "30" },
  loyalty: { ...EMPTY_DRAFT, preset: "cashback", kind: "cashback", cashbackRate: "5", cashbackMinimum: "20,00", cashbackExpiryDays: "60", loyaltySpendPerPoint: "1,00", loyaltyRedeemPerPoint: "0,01" },
  frequency: { ...EMPTY_DRAFT, preset: "post_order", name: "Pontos depois de cada compra", bonusPoints: "10", minimumTotal: "30,00" },
  announcement: { ...EMPTY_DRAFT, preset: "menu_news", name: "Novidade no cardápio", objective: "Divulgar novidade", content: "Tem novidade no nosso cardápio. Confira as opções e faça seu pedido!" },
  best: { ...EMPTY_DRAFT, preset: "orders5", name: "Clientes VIP — 5 pedidos ou mais", criterion: "orders", ordersCount: "5", totalSpent: "300,00", description: "Clientes recorrentes para ações especiais" },
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className={styles.primary} type="submit" disabled={pending}>{pending ? "Salvando…" : label}</button>;
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function GrowthObjectiveWizard({ settings }: Props) {
  const [selected, setSelected] = useState<ObjectiveKey | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFTS.return);

  const objective = OBJECTIVES.find((item) => item.key === selected) ?? null;

  function chooseObjective(key: ObjectiveKey) {
    setSelected(key);
    setDraft({ ...INITIAL_DRAFTS[key] });
    setStep(1);
  }

  function update(name: string, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function applyPreset(preset: string) {
    if (!selected) return;
    const presets: Partial<Record<ObjectiveKey, Record<string, Partial<Draft>>>> = {
      return: {
        inactive15: { preset, name: "Clientes inativos há 15 dias", days: "15", description: "Clientes que não compram há pelo menos 15 dias" },
        inactive30: INITIAL_DRAFTS.return,
        inactive60: { preset, name: "Clientes inativos há 60 dias", days: "60", description: "Clientes que não compram há pelo menos 60 dias" },
      },
      promotion: {
        return_coupon: INITIAL_DRAFTS.promotion,
        weekend: { preset, code: "FIMDESEMANA", name: "Promoção de fim de semana", discountType: "percentage", discountValue: "10", minimumOrder: "40,00", usageLimitPerCustomer: "1", validDays: "7" },
      },
      loyalty: {
        cashback: INITIAL_DRAFTS.loyalty,
        points: { ...INITIAL_DRAFTS.loyalty, preset, kind: "points" },
      },
      frequency: {
        post_order: INITIAL_DRAFTS.frequency,
      },
      announcement: {
        menu_news: INITIAL_DRAFTS.announcement,
        weekend: { preset, name: "Promoção de fim de semana", objective: "Divulgar promoção", content: "A promoção do fim de semana já começou. Confira as opções e aproveite!" },
        birthday: { preset, name: "Mensagem de aniversário", objective: "Relacionamento", content: "Feliz aniversário! Preparamos uma mensagem especial para celebrar seu dia." },
      },
      best: {
        orders5: INITIAL_DRAFTS.best,
        high_spend: { preset, name: "Clientes VIP — alto gasto", criterion: "spent", ordersCount: "5", totalSpent: "300,00", description: "Clientes com alto valor acumulado em compras" },
      },
    };
    const next = presets[selected]?.[preset];
    if (next) setDraft({ ...INITIAL_DRAFTS[selected], ...next });
  }

  return (
    <section className={styles.objectives} aria-labelledby="growth-next-action">
      <div className={styles.objectivesHeader}>
        <p className={styles.eyebrow}>COMECE PELO RESULTADO</p>
        <h2 id="growth-next-action">O que você quer fazer agora?</h2>
        <p>Escolha um objetivo. O PedeAqui mostra apenas o necessário e pede sua confirmação antes de salvar.</p>
      </div>

      <div className={styles.objectiveGrid}>
        {OBJECTIVES.map((item) => (
          <button key={item.key} type="button" className={styles.objectiveCard} data-selected={selected === item.key} onClick={() => chooseObjective(item.key)}>
            <strong>{item.title}</strong><span>{item.description}</span><b>{item.action} →</b>
          </button>
        ))}
        <Link className={styles.objectiveCard} href="/crescimento/campanhas"><strong>Acompanhar resultados</strong><span>Veja públicos preparados, envios e situações que precisam de atenção.</span><b>Abrir resultados →</b></Link>
      </div>

      {selected && objective ? (
        <div className={styles.wizard} aria-live="polite">
          <div className={styles.wizardHeader}>
            <div><span>Passo {step} de 3</span><h3>{objective.title}</h3></div>
            <button type="button" className={styles.closeWizard} onClick={() => setSelected(null)} aria-label="Fechar passo a passo">×</button>
          </div>
          <ol className={styles.steps} aria-label="Etapas">
            <li data-active={step === 1}>1. Modelo</li><li data-active={step === 2}>2. Ajustes</li><li data-active={step === 3}>3. Revisão</li>
          </ol>

          {step === 1 ? <PresetStep selected={selected} draft={draft} applyPreset={applyPreset} /> : null}
          {step === 2 ? <ConfigurationStep selected={selected} draft={draft} update={update} /> : null}
          {step === 3 ? <ReviewStep selected={selected} objective={objective} draft={draft} settings={settings} /> : null}

          <div className={styles.wizardActions}>
            {step > 1 ? <button type="button" className={styles.secondary} onClick={() => setStep((value) => value - 1)}>Voltar</button> : <span />}
            {step < 3 ? <button type="button" className={styles.primary} onClick={() => setStep((value) => value + 1)}>Continuar</button> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PresetStep({ selected, draft, applyPreset }: { selected: ObjectiveKey; draft: Draft; applyPreset: (preset: string) => void }) {
  const options: Record<ObjectiveKey, Array<[string, string, string]>> = {
    return: [["inactive15", "15 dias", "Retorno mais rápido"], ["inactive30", "30 dias", "Equilíbrio recomendado"], ["inactive60", "60 dias", "Clientes mais antigos"]],
    promotion: [["return_coupon", "Cupom de retorno", "10% para uma nova compra"], ["weekend", "Fim de semana", "Promoção curta e simples"]],
    loyalty: [["cashback", "Cashback", "Devolve parte do valor"], ["points", "Pontos", "Premia a frequência"]],
    frequency: [["post_order", "Pós-compra", "Pontos após pedido concluído"]],
    announcement: [["menu_news", "Novidade no cardápio", "Rascunho de divulgação"], ["weekend", "Fim de semana", "Rascunho promocional"], ["birthday", "Aniversário", "Rascunho de relacionamento"]],
    best: [["orders5", "5+ pedidos", "Clientes recorrentes"], ["high_spend", "Alto gasto", "Clientes de maior valor"]],
  };
  return <div className={styles.presetGrid}>{options[selected].map(([value, title, description]) => <button key={value} type="button" data-selected={draft.preset === value} onClick={() => applyPreset(value)}><strong>{title}</strong><span>{description}</span></button>)}</div>;
}

function ConfigurationStep({ selected, draft, update }: { selected: ObjectiveKey; draft: Draft; update: (name: string, value: string) => void }) {
  if (selected === "return") return <div className={styles.formGrid}><Field label="Nome do grupo" name="name" value={draft.name} update={update} /><Field label="Tempo sem comprar (dias)" name="days" value={draft.days} update={update} type="number" /><Field label="Descrição" name="description" value={draft.description} update={update} /></div>;
  if (selected === "promotion") return <div className={styles.formGrid}><Field label="Código" name="code" value={draft.code} update={update} /><Field label="Nome da promoção" name="name" value={draft.name} update={update} /><SelectField label="Tipo" name="discountType" value={draft.discountType} update={update} options={[["percentage", "Percentual"], ["fixed", "Valor fixo"]]} /><Field label="Desconto" name="discountValue" value={draft.discountValue} update={update} /><Field label="Pedido mínimo" name="minimumOrder" value={draft.minimumOrder} update={update} /><Field label="Validade (dias)" name="validDays" value={draft.validDays} update={update} type="number" /><Field label="Limite por cliente" name="usageLimitPerCustomer" value={draft.usageLimitPerCustomer} update={update} type="number" /></div>;
  if (selected === "loyalty") return <div className={styles.formGrid}><SelectField label="Como premiar" name="kind" value={draft.kind} update={update} options={[["cashback", "Cashback"], ["points", "Pontos"]]} />{draft.kind === "cashback" ? <><Field label="Cashback por compra (%)" name="cashbackRate" value={draft.cashbackRate} update={update} /><Field label="Pedido mínimo" name="cashbackMinimum" value={draft.cashbackMinimum} update={update} /><Field label="Validade (dias)" name="cashbackExpiryDays" value={draft.cashbackExpiryDays} update={update} type="number" /></> : <><Field label="Gasto para ganhar 1 ponto" name="loyaltySpendPerPoint" value={draft.loyaltySpendPerPoint} update={update} /><Field label="Valor de cada ponto" name="loyaltyRedeemPerPoint" value={draft.loyaltyRedeemPerPoint} update={update} /></>}</div>;
  if (selected === "frequency") return <div className={styles.formGrid}><Field label="Nome da ação" name="name" value={draft.name} update={update} /><Field label="Pontos por pedido" name="bonusPoints" value={draft.bonusPoints} update={update} type="number" /><Field label="Pedido mínimo" name="minimumTotal" value={draft.minimumTotal} update={update} /></div>;
  if (selected === "announcement") return <div className={styles.formGrid}><Field label="Nome da campanha" name="name" value={draft.name} update={update} /><Field label="Objetivo" name="objective" value={draft.objective} update={update} /><label className={styles.label}>Mensagem<textarea className={`${styles.field} ${styles.textarea}`} value={draft.content} onChange={(event) => update("content", event.target.value)} maxLength={4000} /></label></div>;
  return <div className={styles.formGrid}><Field label="Nome do grupo" name="name" value={draft.name} update={update} /><SelectField label="Critério" name="criterion" value={draft.criterion} update={update} options={[["orders", "Quantidade de pedidos"], ["spent", "Valor gasto"]]} />{draft.criterion === "orders" ? <Field label="Pedidos mínimos" name="ordersCount" value={draft.ordersCount} update={update} type="number" /> : <Field label="Gasto mínimo" name="totalSpent" value={draft.totalSpent} update={update} />}<Field label="Descrição" name="description" value={draft.description} update={update} /></div>;
}

function Field({ label, name, value, update, type = "text" }: { label: string; name: string; value: string; update: (name: string, value: string) => void; type?: string }) {
  return <label className={styles.label}>{label}<input className={styles.field} type={type} value={value} min={type === "number" ? 1 : undefined} onChange={(event) => update(name, event.target.value)} /></label>;
}

function SelectField({ label, name, value, update, options }: { label: string; name: string; value: string; update: (name: string, value: string) => void; options: Array<[string, string]> }) {
  return <label className={styles.label}>{label}<select className={styles.field} value={value} onChange={(event) => update(name, event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function ReviewStep({ selected, objective, draft, settings }: { selected: ObjectiveKey; objective: (typeof OBJECTIVES)[number]; draft: Draft; settings: Props["settings"] }) {
  const summary = selected === "return" ? `${draft.name}: sem comprar há ${draft.days} dias`
    : selected === "promotion" ? `${draft.code}: ${draft.discountValue}${draft.discountType === "percentage" ? "%" : " reais"} de desconto`
      : selected === "loyalty" ? draft.kind === "cashback" ? `${draft.cashbackRate}% de cashback por compra` : `1 ponto a cada R$ ${draft.loyaltySpendPerPoint}`
        : selected === "frequency" ? `${draft.bonusPoints} pontos depois de um pedido concluído`
          : selected === "announcement" ? `${draft.name}: campanha criada como rascunho`
            : `${draft.name}: ${draft.criterion === "orders" ? `${draft.ordersCount}+ pedidos` : `R$ ${draft.totalSpent} ou mais`}`;
  return <div className={styles.review}><p><strong>Confira antes de criar</strong></p><p>{summary}</p><small>Nada será enviado ao cliente agora. Você poderá editar e ativar a próxima etapa depois.</small><CanonicalForm selected={selected} objective={objective} draft={draft} settings={settings} /></div>;
}

function CanonicalForm({ selected, objective, draft, settings }: { selected: ObjectiveKey; objective: (typeof OBJECTIVES)[number]; draft: Draft; settings: Props["settings"] }) {
  if (selected === "return") return <form action={createSegmentAction}><Hidden name="guidedResult" value="grupo" /><Hidden name="name" value={draft.name} /><Hidden name="description" value={draft.description} /><Hidden name="inactiveDaysMin" value={draft.days} /><SubmitButton label={objective.action} /></form>;
  if (selected === "promotion") return <form action={createCouponAction}><Hidden name="guidedResult" value="cupom" /><Hidden name="code" value={draft.code} /><Hidden name="name" value={draft.name} /><Hidden name="discountType" value={draft.discountType} /><Hidden name="discountValue" value={draft.discountValue} /><Hidden name="minimumOrder" value={draft.minimumOrder} /><Hidden name="validDays" value={draft.validDays} /><Hidden name="usageLimitPerCustomer" value={draft.usageLimitPerCustomer} /><SubmitButton label={objective.action} /></form>;
  if (selected === "loyalty") return <form action={saveGrowthSettingsAction}>
    <Hidden name="guidedResult" value="fidelidade" />
    {draft.kind === "cashback" || settings.cashbackEnabled ? <Hidden name="cashbackEnabled" value="on" /> : null}
    {draft.kind === "points" || settings.loyaltyEnabled ? <Hidden name="loyaltyEnabled" value="on" /> : null}
    <Hidden name="cashbackRate" value={draft.kind === "cashback" ? draft.cashbackRate : settings.cashbackRate} />
    <Hidden name="cashbackMinOrder" value={draft.kind === "cashback" ? draft.cashbackMinimum : settings.cashbackMinimum} />
    <Hidden name="cashbackExpiryDays" value={draft.kind === "cashback" ? draft.cashbackExpiryDays : settings.cashbackExpiryDays} />
    <Hidden name="loyaltySpendPerPoint" value={draft.kind === "points" ? draft.loyaltySpendPerPoint : settings.loyaltySpendPerPoint} />
    <Hidden name="loyaltyRedeemPerPoint" value={draft.kind === "points" ? draft.loyaltyRedeemPerPoint : settings.loyaltyRedeemPerPoint} />
    <SubmitButton label={objective.action} />
  </form>;
  if (selected === "frequency") return <form action={createAutomationAction}><Hidden name="guidedResult" value="automacao" /><Hidden name="name" value={draft.name} /><Hidden name="triggerType" value="order.completed" /><Hidden name="actionType" value="bonus_points" /><Hidden name="bonusPoints" value={draft.bonusPoints} /><Hidden name="minimumTotal" value={draft.minimumTotal} /><SubmitButton label={objective.action} /></form>;
  if (selected === "announcement") return <form action={createCampaignAction}><Hidden name="guidedResult" value="campanha" /><Hidden name="name" value={draft.name} /><Hidden name="objective" value={draft.objective} /><Hidden name="content" value={draft.content} /><Hidden name="channel" value="internal" /><SubmitButton label={objective.action} /></form>;
  return <form action={createSegmentAction}><Hidden name="guidedResult" value="grupo" /><Hidden name="name" value={draft.name} /><Hidden name="description" value={draft.description} />{draft.criterion === "orders" ? <Hidden name="ordersCountMin" value={draft.ordersCount} /> : <Hidden name="totalSpentMin" value={draft.totalSpent} />}<SubmitButton label={objective.action} /></form>;
}
