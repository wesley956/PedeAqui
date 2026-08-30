import Link from "next/link";
import {
  CommercialCta,
  MarketingCards,
  MarketingHero,
  MarketingSection,
  MarketingShell,
  marketingStyles as styles,
} from "@/components/marketing/marketing-shell";

export default function PlanosPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Planos"
        title={<>Um começo simples, com espaço para <span style={{ color: "var(--brand-primary)" }}>adicionar recursos depois.</span></>}
        description="O PedeAqui foi estruturado para separar o plano-base dos módulos adicionais. Isso evita obrigar toda operação a pagar e usar exatamente o mesmo conjunto de recursos."
      >
        <div className={styles.heroActions}>
          <Link href="/cadastro" className={styles.primaryButton}>Criar minha conta</Link>
          <Link href="/recursos" className={styles.secondaryButton}>Ver recursos</Link>
        </div>
      </MarketingHero>

      <MarketingSection eyebrow="Condição criada para o início do PedeAqui" title="Plano Fundadores">
        <div className={styles.splitGrid}>
          <div>
            <p className={styles.heroLead}>O Plano Fundadores foi definido para os três primeiros clientes do PedeAqui, com preço-base travado enquanto o cliente permanecer no plano contratado.</p>
            <MarketingCards cards={[
              { eyebrow: "Contrato", title: "Preço-base protegido", description: "Mudanças futuras em outros planos não alteram retroativamente o contrato do cliente Fundador." },
              { eyebrow: "Evolução", title: "Recursos extras podem ser adicionados", description: "Módulos e melhorias adicionais podem ser contratados separadamente sem substituir o plano-base." },
            ]} />
          </div>
          <aside className={styles.priceCard}>
            <small>PLANO FUNDADORES</small>
            <div className={styles.priceValue}>R$ 79,90 <span>/ mês</span></div>
            <p>Condição definida para os três primeiros clientes do PedeAqui.</p>
            <div className={styles.priceList}>
              <div>Preço-base mensal definido no contrato</div>
              <div>Compatível com a estrutura de recursos por módulos</div>
              <div>Alterações futuras não reescrevem contratos antigos</div>
              <div>Correções e segurança não mudam o preço-base</div>
            </div>
            <Link href="/cadastro" className={styles.primaryButton}>Quero conhecer o PedeAqui</Link>
            <p style={{ fontSize: 12, marginBottom: 0 }}>A disponibilidade desta condição depende do limite de clientes Fundadores. O PedeAqui não publica preço de módulo adicional sem valor comercial definido.</p>
          </aside>
        </div>
      </MarketingSection>

      <MarketingSection tone="soft" eyebrow="Como os módulos entram" title="Você não precisa contratar uma lista incompreensível de funções." intro="A lógica comercial é separar o que faz parte da base da operação dos recursos adicionais que fazem sentido para cada negócio.">
        <MarketingCards cards={[
          { eyebrow: "1", title: "Comece pelo que precisa", description: "A contratação define uma base coerente para o tipo de operação e evita ligar recursos só para preencher o painel." },
          { eyebrow: "2", title: "Adicione quando fizer sentido", description: "Entrega, crescimento, estoque, PDV e outras áreas podem seguir as regras do plano e dos módulos disponíveis." },
          { eyebrow: "3", title: "Seu histórico continua", description: "Desativar um recurso não significa apagar automaticamente o que já aconteceu na operação." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="dark" eyebrow="Transparência" title="Preço que não existe ainda não aparece inventado no site." intro="O PedeAqui já possui estrutura para planos, versões e módulos. Quando novos valores comerciais forem definidos, esta página pode mostrar cada opção usando a mesma fonte de verdade do produto, sem espalhar números fixos pelo código.">
        <MarketingCards cards={[
          { eyebrow: "Sem surpresa", title: "Contrato antigo não muda sozinho", description: "A evolução dos planos futuros não deve alterar o acordo anterior de outro cliente." },
          { eyebrow: "Sem pacote falso", title: "Recurso adicional só recebe preço quando houver preço definido", description: "O site comercial não usa valores de exemplo como se fossem cobrança oficial." },
          { eyebrow: "Sem linguagem técnica", title: "Você escolhe pelo benefício", description: "A explicação comercial fala de entrega, atendimento, cashback e operação — não de nomes internos do sistema." },
        ]} />
      </MarketingSection>

      <CommercialCta title="Quer entender qual conjunto faz sentido para sua operação?" description="Crie sua conta para começar ou entre no painel se você já é cliente." />
    </MarketingShell>
  );
}
