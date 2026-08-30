import Link from "next/link";
import { MODULE_CATALOG, MODULE_KEYS, moduleLabel, type BusinessType } from "@/modules/module-catalog";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import { PlatformCommercialComposerService } from "@/server/platform/platform-commercial-composer-service";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";
import { PlanComposer } from "./plan-composer";
import { CommercialApplyForm } from "./commercial-apply-form";
import styles from "../platform.module.css";

const money = (value: number | null) => value === null
  ? "Preço personalizado"
  : (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const kindLabel = { core: "Base", optional: "Opcional", segmented: "Segmentado" } as const;
const groupLabel = { operation: "Operação", management: "Gestão", supplies: "Suprimentos", relationship: "Relacionamento", administration: "Administração" } as const;

function metadataText(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

export default async function PlatformProductPage() {
  const [data, composer, pixConfiguration] = await Promise.all([
    PlatformAdminService.loadCommercial(),
    PlatformCommercialComposerService.load(),
    SubscriptionPixBillingService.configuration(),
  ]);
  const featureById = new Map(data.features.map((feature) => [feature.id, feature]));
  const featuresByPlan = new Map<string, string[]>();
  for (const relation of data.planFeatures) {
    if (!relation.enabled) continue;
    const feature = featureById.get(relation.feature_id);
    if (!feature) continue;
    featuresByPlan.set(relation.plan_id, [...(featuresByPlan.get(relation.plan_id) ?? []), feature.name]);
  }

  const planById = new Map(data.plans.map((plan) => [plan.id, plan]));
  const organizationById = new Map(data.organizations.map((organization) => [organization.id, organization]));
  const founderRows = data.subscriptions
    .filter((subscription) => Boolean(subscription.founder_slot))
    .map((subscription) => ({
      id: subscription.id,
      organizationName: organizationById.get(subscription.organization_id)?.name ?? "Empresa indisponível",
      founderSlot: subscription.founder_slot,
      contractPlan: planById.get(subscription.plan_id)?.name ?? "Fundadores",
      functionalPlan: metadataText(subscription.metadata, "functional_plan_label"),
      agreedPriceCents: subscription.agreed_price_cents,
      priceLocked: subscription.price_locked,
    }))
    .sort((a, b) => (a.founderSlot ?? 99) - (b.founderSlot ?? 99));

  const moduleRows = MODULE_KEYS.map((key) => {
    const definition = MODULE_CATALOG[key];
    return {
      key,
      label: moduleLabel(key, "restaurant"),
      description: definition.description,
      group: definition.group,
      kind: definition.kind,
      canDisable: definition.canDisable,
      dependencies: [...definition.dependencies],
      entitlementFeatureKey: definition.entitlementFeatureKey,
      supportedBusinessTypes: [...definition.supportedBusinessTypes] as BusinessType[],
    };
  });
  const optionalCount = moduleRows.filter((item) => item.kind !== "core").length;
  const gatedCount = moduleRows.filter((item) => Boolean(item.entitlementFeatureKey)).length;
  const pixReady = pixConfiguration.billingEnabled && pixConfiguration.accessTokenConfigured && pixConfiguration.webhookSecretConfigured && pixConfiguration.cronSecretConfigured;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PRODUTO · COMERCIAL</p>
          <h1>Pacotes, módulos e plano personalizado</h1>
          <p>Centralize como o PedeAqui é vendido sem misturar preço com permissão. Pacotes facilitam a venda; módulos avulsos dão flexibilidade; o plano personalizado monta uma composição sob medida.</p>
        </div>
        <span className={styles.roleBadge}>{data.role === "super_admin" ? "Gestão de produto" : "Consulta"}</span>
      </header>

      <section className={styles.metrics} aria-label="Resumo do produto">
        <Metric label="Pacotes cadastrados" value={data.plans.length} helper={`${data.plans.filter((plan) => plan.active).length} disponíveis para novas vendas`} />
        <Metric label="Módulos do produto" value={moduleRows.length} helper={`${optionalCount} opcionais ou segmentados`} />
        <Metric label="Gates comerciais" value={gatedCount} helper="vínculos técnicos explícitos hoje" />
        <Metric label="Modelos de venda" value={3} helper="pacote, pacote + extras e personalizado" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Três formas de vender</h2><p>As três usam a mesma base contratual. O que muda é como a proposta é montada.</p></div>
        </div>
        <div className={styles.supportGrid}>
          <CommercialCard title="Pacote pronto" text="Conjunto versionado de recursos por um preço mensal. É a opção mais simples para vender e deve oferecer melhor custo-benefício que a soma avulsa equivalente." />
          <CommercialCard title="Pacote + módulos" text="O cliente escolhe um pacote e adiciona somente os módulos extras que precisa. Os add-ons preservam o contrato-base e têm histórico próprio." />
          <CommercialCard title="Monte seu plano" text="Composição personalizada com mensalidade-base e módulos escolhidos. Módulos obrigatórios e dependências continuam protegidos pelo motor operacional." />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Pacotes comerciais atuais</h2><p>Planos fora de venda continuam preservados para clientes antigos; não é necessário apagar histórico para lançar uma nova versão.</p></div>
          <Link className={styles.button} href="/platform/assinaturas">Gerenciar contratos</Link>
        </div>
        <div className={styles.planGrid}>
          {data.plans.map((plan) => {
            const features = featuresByPlan.get(plan.id) ?? [];
            return (
              <article className={styles.planCard} key={plan.id}>
                <div className={styles.cardTop}>
                  <strong>{plan.name}</strong>
                  <span className={styles.pill} data-tone={plan.active ? "good" : "neutral"}>{plan.active ? "Em venda" : "Legado"}</span>
                </div>
                <span className={styles.meta}>{money(plan.monthly_price_cents)}{plan.monthly_price_cents === null ? "" : " / mês"}</span>
                <span className={styles.meta}>{plan.description || "Sem descrição comercial."}</span>
                <div className={styles.featureList}>
                  {features.slice(0, 6).map((feature) => <div className={styles.featureRow} key={`${plan.id}:${feature}`}><span>{feature}</span><strong>Incluído</strong></div>)}
                  {features.length > 6 ? <span className={styles.meta}>+ {features.length - 6} recurso(s)</span> : null}
                  {features.length === 0 ? <div className={styles.empty}>Pacote sem recursos comerciais vinculados.</div> : null}
                </div>
              </article>
            );
          })}
          {data.plans.length === 0 ? <div className={styles.empty}>Nenhum pacote cadastrado.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Clientes Fundadores</h2><p>O contrato especial e o equivalente funcional aparecem separados. O equivalente informa os recursos em uso e nunca altera sozinho o preço protegido.</p></div>
        </div>
        <div className={styles.featureList}>
          {founderRows.map((item) => (
            <div className={styles.featureRow} key={item.id}>
              <span>
                <strong>{item.organizationName} · Fundador #{item.founderSlot}</strong>
                <small>Contrato: {item.contractPlan} · Equivalência funcional: {item.functionalPlan ?? "a classificar"}</small>
              </span>
              <strong>{money(item.agreedPriceCents)}{item.priceLocked ? " · protegido" : ""}</strong>
            </div>
          ))}
          {founderRows.length === 0 ? <div className={styles.empty}>Nenhum cliente Fundador atribuído.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Cobrança SaaS por PIX</h2><p>A mensalidade do PedeAqui usa a conta Mercado Pago do proprietário como fonte OAuth/Vault e permanece isolada do dinheiro recebido pelos restaurantes.</p></div>
          <span className={styles.pill} data-tone={pixReady ? "good" : pixConfiguration.sourceConfigured ? "warn" : "neutral"}>{pixReady ? "Ativa e pronta" : pixConfiguration.sourceConfigured ? "Fonte vinculada · desligada" : "Não configurada"}</span>
        </div>
        <div className={styles.supportGrid}>
          <CommercialCard title="Mercado Pago do proprietário" text={pixConfiguration.sourceConfigured ? `Conta vinculada${pixConfiguration.sourceOwnerEmail ? ` a ${pixConfiguration.sourceOwnerEmail}` : ""}${pixConfiguration.providerAccountId ? ` · ID ${pixConfiguration.providerAccountId}` : ""}. Saúde: ${pixConfiguration.providerHealthStatus}.` : "Nenhuma fonte OAuth foi definida para a cobrança da plataforma."} />
          <CommercialCard title="Credenciais no Vault" text={pixConfiguration.accessTokenConfigured ? "OAuth e segredo de webhook estão disponíveis no cofre; nenhum token precisa ser copiado para o código." : "A fonte ainda não possui credenciais utilizáveis para cobrança."} />
          <CommercialCard title="Renovação automática" text={!pixConfiguration.billingEnabled ? "Interruptor financeiro desligado. Nenhum PIX de mensalidade pode ser criado agora." : pixConfiguration.cronSecretConfigured ? "Cobrança habilitada e job interno protegido disponível." : "Cobrança habilitada, mas o job continua bloqueado até a configuração final de produção."} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Catálogo técnico de módulos</h2><p>Este catálogo é a fonte de verdade operacional. Dependências e módulos-base não devem ser ignorados por uma regra comercial.</p></div>
        </div>
        <div className={styles.featureList}>
          {moduleRows.map((module) => (
            <div className={styles.featureRow} key={module.key}>
              <span>
                <strong>{module.label}</strong>
                <small>{module.description} · {groupLabel[module.group]} · {kindLabel[module.kind]}{module.dependencies.length ? ` · depende de ${module.dependencies.map((key) => MODULE_CATALOG[key].defaultLabel).join(", ")}` : ""}</small>
              </span>
              <strong>{module.entitlementFeatureKey ? "Gate comercial vinculado" : module.kind === "core" ? "Base protegida" : "Configuração operacional"}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Simulador livre</h2><p>Use para testar combinações sem tocar em cliente real. Dependências são incluídas automaticamente.</p></div>
        </div>
        <PlanComposer modules={moduleRows.map(({ key, label, description, group, kind, dependencies, supportedBusinessTypes }) => ({ key, label, description, group, kind, dependencies, supportedBusinessTypes }))} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Aplicar proposta em um cliente</h2><p>Fluxo real e transacional. O servidor recalcula pacote, dependências e preços; nenhuma seleção altera o cliente antes do botão de aplicação.</p></div>
        </div>
        {composer.role === "super_admin" ? (
          <CommercialApplyForm organizations={composer.organizations} plans={composer.plans} modules={composer.modules} />
        ) : (
          <div className={styles.empty}>Seu perfil tem acesso de consulta. Somente super_admin pode aplicar uma composição comercial.</div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Regra de implantação segura</h2><p>Preço e contrato podem evoluir sem transformar toda mudança comercial em risco operacional.</p></div>
        </div>
        <div className={styles.supportGrid}>
          <CommercialCard title="Contrato" text="Proposta, aceite, vigência, preço e histórico ficam no motor de assinatura. Add-ons não reescrevem a mensalidade-base anterior." />
          <CommercialCard title="Acesso" text="RBAC, módulos da unidade e entitlements continuam verificando se o recurso pode ser usado. Menu escondido sozinho nunca é autorização." />
          <CommercialCard title="Downgrade" text="Antes de desligar um módulo, o sistema valida dependentes e bloqueadores operacionais. Nenhuma retirada automática ignora caixa, entrega ou outras operações abertas." />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}

function CommercialCard({ title, text }: { title: string; text: string }) {
  return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>;
}
