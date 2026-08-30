import type { Metadata } from "next";
import Link from "next/link";
import {
  CommercialCta,
  MarketingCards,
  MarketingHero,
  MarketingSection,
  MarketingShell,
  marketingStyles as styles,
} from "@/components/marketing/marketing-shell";
import { CommercialCatalogService, formatCommercialPrice } from "@/server/billing/commercial-catalog-service";

export const metadata: Metadata = {
  title: "Planos e preços",
  description: "Conheça os três planos do PedeAqui e comece com 15 dias grátis.",
};

const badges: Record<string, string> = {
  essential: "Base da operação",
  professional: "Mais escolhido",
  management: "Gestão completa",
};

export default async function PlanosPage() {
  const [plans, trialDays, modules] = await Promise.all([
    CommercialCatalogService.listPublicPlans(),
    CommercialCatalogService.getTrialDays(),
    CommercialCatalogService.listCommercialModules(),
  ]);

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Planos e preços"
        title={<>Escolha seu plano. <span style={{ color: "var(--brand-primary)" }}>Teste por {trialDays} dias grátis.</span></>}
        description="Comece sem pagar. Depois do período de teste, confirme a assinatura para continuar usando o PedeAqui."
      >
        <div className={styles.heroActions}>
          <Link href="/cadastro" className={styles.primaryButton}>Começar teste grátis</Link>
          <Link href="/login" className={styles.secondaryButton}>Já tenho uma conta</Link>
        </div>
      </MarketingHero>

      <MarketingSection
        eyebrow="Planos oficiais"
        title="Três opções, uma única regra em todo o sistema."
        intro="O plano escolhido aqui é o mesmo usado no cadastro, na configuração da conta, no painel e na cobrança."
      >
        <div className={styles.plansGrid}>
          {plans.map((plan) => (
            <article key={plan.key} className={styles.planCard} data-featured={plan.featured ? "true" : "false"}>
              <div className={styles.planTopline}>
                <strong>{plan.name}</strong>
                <span className={styles.planBadge}>{badges[plan.key]}</span>
              </div>
              <div className={styles.planPrice}>{formatCommercialPrice(plan.monthlyPriceCents, plan.currency)} <span>/ mês após o teste</span></div>
              <p>{plan.description}</p>
              <ul className={styles.planFeatureList}>
                {plan.features.slice(0, 6).map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <div className={styles.planCta}>
                <Link href={`/cadastro?plan=${plan.key}`} className={plan.featured ? styles.primaryButton : styles.secondaryButton}>Começar {trialDays} dias grátis</Link>
              </div>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        tone="soft"
        eyebrow="Módulos extras"
        title="Precisa de algo fora do plano? Solicite quando quiser."
        intro="Qualquer cliente pode solicitar um módulo adicional, independentemente do plano. O recurso só é ativado depois da aprovação e o valor adicional fica claro antes da mudança."
      >
        <MarketingCards cards={modules.slice(0, 12).map((module) => ({
          eyebrow: `+ ${formatCommercialPrice(module.monthlyPriceCents)}/mês`,
          title: module.name,
          description: module.description || "Módulo adicional disponível mediante solicitação de ativação.",
        }))} />
      </MarketingSection>

      <MarketingSection
        tone="dark"
        eyebrow="Condição Fundadores"
        title="Preço-base protegido para os clientes que você escolher como Fundadores."
        intro="Fundadores continuam vinculados ao plano contratado com preço-base protegido. Módulos adicionais, quando solicitados e aprovados, são cobrados separadamente. Essa condição é administrada pelo PedeAqui e não é um quarto plano público."
      />

      <CommercialCta title="Pronto para testar o PedeAqui?" description={`Escolha um dos três planos e use por ${trialDays} dias grátis antes do primeiro pagamento.`} />
    </MarketingShell>
  );
}
