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

export const metadata: Metadata = {
  title: "Planos e preços",
  description: "Conheça os planos ativos do PedeAqui, seus valores mensais e como os recursos podem acompanhar a necessidade da sua operação.",
};

const commercialPlans = [
  {
    name: "Personalizado",
    badge: "Monte sua combinação",
    price: "R$ 69,90",
    suffix: "/ mês + módulos",
    description: "Uma base enxuta para montar a operação com os módulos adicionais que realmente fizerem sentido.",
    features: [
      "Cardápio e catálogo",
      "Pedidos e clientes",
      "Dashboard e configurações",
      "Módulos adicionais contratados à parte",
    ],
  },
  {
    name: "Essencial",
    badge: "Base da operação",
    price: "R$ 89,90",
    suffix: "/ mês",
    description: "Para começar com o núcleo do pedido digital e da organização da loja em um pacote definido.",
    features: [
      "Cardápio e catálogo",
      "Pedidos",
      "Clientes",
      "Dashboard e configurações",
    ],
  },
  {
    name: "Profissional",
    badge: "Operação + entrega",
    price: "R$ 129,90",
    suffix: "/ mês",
    description: "Para quem quer levar o pedido além do balcão e conectar produção, entrega e fidelização à rotina.",
    featured: true,
    features: [
      "Tudo do núcleo Essencial",
      "Produção e organização da entrega",
      "Entregadores",
      "Marketing e fidelização",
      "Domínio personalizado e integrações disponíveis",
    ],
  },
  {
    name: "Completo",
    badge: "Gestão avançada",
    price: "R$ 179,90",
    suffix: "/ mês",
    description: "Para operações que precisam reunir atendimento, gestão, estoque, financeiro, equipe e recursos avançados.",
    features: [
      "Pedidos, catálogo, produção e entrega",
      "PDV, caixa, salão e mesas",
      "Estoque, compras e fornecedores",
      "Financeiro, equipe e escala",
      "Recursos avançados de multiunidade e marca",
    ],
  },
];

export default function PlanosPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Planos e preços"
        title={<>Escolha uma base clara. <span style={{ color: "var(--brand-primary)" }}>Adicione complexidade só quando precisar.</span></>}
        description="O PedeAqui tem pacotes ativos para diferentes momentos da operação e também uma opção personalizada. Os valores abaixo correspondem ao catálogo comercial atual."
      >
        <div className={styles.heroActions}>
          <Link href="/cadastro" className={styles.primaryButton}>Criar minha conta</Link>
          <Link href="/recursos" className={styles.secondaryButton}>Comparar recursos</Link>
        </div>
      </MarketingHero>

      <MarketingSection
        eyebrow="Catálogo atual"
        title="Um plano para o tamanho da sua rotina — não para encher seu painel de funções."
        intro="Os pacotes agrupam recursos que trabalham juntos. No Personalizado, a mensalidade-base começa menor e os módulos escolhidos entram separadamente."
      >
        <div className={styles.plansGrid}>
          {commercialPlans.map((plan) => (
            <article key={plan.name} className={styles.planCard} data-featured={plan.featured ? "true" : "false"}>
              <div className={styles.planTopline}>
                <strong>{plan.name}</strong>
                <span className={styles.planBadge}>{plan.badge}</span>
              </div>
              <div className={styles.planPrice}>{plan.price} <span>{plan.suffix}</span></div>
              <p>{plan.description}</p>
              <ul className={styles.planFeatureList}>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <div className={styles.planCta}>
                <Link href="/cadastro" className={plan.featured ? styles.primaryButton : styles.secondaryButton}>Quero conhecer este plano</Link>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.founderBand}>
          <div>
            <h3>Plano Fundadores</h3>
            <p>Condição especial criada para os três primeiros clientes do PedeAqui, com preço-base protegido enquanto permanecerem no plano contratado. A disponibilidade é confirmada no momento da contratação porque essa condição possui limite de vagas.</p>
          </div>
          <div className={styles.founderPrice}>R$ 79,90 <span>/ mês</span></div>
        </div>
      </MarketingSection>

      <MarketingSection
        tone="soft"
        eyebrow="Como escolher"
        title="Pense no que sua operação precisa fazer hoje."
        intro="Você não precisa decidir pela quantidade de telas. O melhor ponto de partida é entender quais partes da rotina precisam estar no mesmo fluxo."
      >
        <MarketingCards cards={[
          { eyebrow: "Personalizado", title: "Quero montar aos poucos", description: "Comece pela base e adicione os módulos comerciais liberados conforme a necessidade e o orçamento da operação." },
          { eyebrow: "Essencial", title: "Quero receber e organizar pedidos", description: "O núcleo reúne cardápio, pedidos, clientes, dashboard e configurações para a rotina começar organizada." },
          { eyebrow: "Profissional", title: "Quero operar entrega e fidelização", description: "Além do núcleo, entram recursos para produção, entrega, entregadores e relacionamento com o cliente." },
          { eyebrow: "Completo", title: "Quero centralizar gestão e operação", description: "A proposta amplia o pacote para áreas como PDV, caixa, estoque, compras, financeiro, equipe e gestão avançada." },
        ]} />
      </MarketingSection>

      <MarketingSection
        tone="dark"
        eyebrow="Transparência"
        title="Preço-base e módulos extras são coisas diferentes."
        intro="O PedeAqui preserva a condição comercial contratada e permite que recursos adicionais sejam tratados separadamente. Assim, evoluir o produto não significa reescrever automaticamente o acordo de quem já é cliente."
      >
        <MarketingCards cards={[
          { eyebrow: "Contrato", title: "O valor combinado fica registrado", description: "Planos e mudanças comerciais seguem versões próprias para preservar o histórico do cliente." },
          { eyebrow: "Módulos", title: "Adicional entra quando houver contratação", description: "Um recurso fora do pacote-base não aparece como cobrança escondida. A composição comercial define o que está incluído e o que é adicional." },
          { eyebrow: "Evolução", title: "Correção e segurança não viram novo plano", description: "Manutenção do produto não é tratada como desculpa para alterar automaticamente o preço-base já contratado." },
        ]} />
      </MarketingSection>

      <CommercialCta title="Quer escolher pelo que sua operação realmente precisa?" description="Crie sua conta para começar ou entre no painel se você já usa o PedeAqui." />
    </MarketingShell>
  );
}
