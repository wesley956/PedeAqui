import Link from "next/link";
import {
  CommercialCta,
  MarketingCards,
  MarketingHero,
  MarketingSection,
  MarketingShell,
  marketingStyles as styles,
} from "@/components/marketing/marketing-shell";

const productCards = [
  {
    eyebrow: "Cliente",
    title: "Entenda como o pedido acontece",
    description: "Do link do cardápio até a confirmação, veja o caminho que o cliente percorre sem depender de uma conversa para montar o pedido.",
    href: "/como-funciona",
  },
  {
    eyebrow: "Operação",
    title: "Veja o que sua equipe recebe",
    description: "O pedido entra organizado, pode seguir para impressão e preparo e continua no painel até retirada ou entrega.",
    href: "/pedidos-e-atendimento",
  },
  {
    eyebrow: "Entrega + retorno",
    title: "Da saída do pedido à próxima compra",
    description: "Bairros, taxas, entregadores e recursos de fidelização trabalham em sequência quando fazem parte da sua operação.",
    href: "/entrega-e-fidelizacao",
  },
];

export default function HomePage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Pedidos próprios, operação organizada"
        title={<>Seu cliente pede. <span style={{ color: "var(--brand-primary)" }}>O PedeAqui organiza.</span></>}
        description="Tenha um cardápio por link e receba os pedidos em um fluxo claro para atendimento, preparo, retirada ou entrega. O cliente entende como pedir e sua equipe entende o que fazer depois."
      >
        <div className={styles.heroActions}>
          <Link href="/cadastro" className={styles.primaryButton}>Criar minha conta</Link>
          <Link href="/como-funciona" className={styles.secondaryButton}>Ver como funciona</Link>
        </div>
        <div className={styles.heroPoints}>
          <span>Cardápio por link</span>
          <span>Pedidos organizados</span>
          <span>Entrega e fidelização quando configuradas</span>
        </div>

        <div className={styles.heroVisual} aria-label="Exemplo visual do fluxo de um pedido no PedeAqui">
          <div className={styles.previewPanel}>
            <div className={styles.previewPanelHeader}>
              <div><small>OPERAÇÃO</small><strong>Pedidos de agora</strong></div>
              <span className={styles.statusPill}>Loja aberta</span>
            </div>
            <div className={styles.orderList}>
              <div className={styles.orderRow}><div><strong>#1048 · Camila</strong><small>Entrega · 2 itens</small></div><span className={styles.orderStatus}>NOVO</span></div>
              <div className={styles.orderRow}><div><strong>#1047 · Rafael</strong><small>Retirada · 4 itens</small></div><span className={styles.orderStatus}>PREPARANDO</span></div>
              <div className={styles.orderRow}><div><strong>#1046 · Bruna</strong><small>Entrega · 1 item</small></div><span className={styles.orderStatus}>SAIU</span></div>
            </div>
          </div>
          <div className={styles.previewTicket}>
            <small style={{ color: "#8a8580", fontWeight: 800 }}>PEDIDO #1048</small>
            <h3>Já chega organizado</h3>
            <div className={styles.ticketLine}><span>2 itens escolhidos</span><strong>✓</strong></div>
            <div className={styles.ticketLine}><span>Endereço informado</span><strong>✓</strong></div>
            <div className={styles.ticketLine}><span>Forma de pagamento</span><strong>✓</strong></div>
            <div className={styles.ticketTotal}><strong>Pronto para operar</strong><strong>→</strong></div>
          </div>
        </div>
      </MarketingHero>

      <MarketingSection
        eyebrow="Produto"
        title="Não é uma página enorme para você tentar entender tudo de uma vez."
        intro="Cada parte importante do PedeAqui ganhou sua própria explicação. Você entra direto no assunto que quer conhecer e vê como aquele recurso se encaixa na rotina."
      >
        <MarketingCards cards={productCards} />
      </MarketingSection>

      <MarketingSection
        tone="soft"
        eyebrow="Na prática"
        title="O ganho aparece no meio da rotina, não em uma lista de palavras bonitas."
        intro="A proposta é simples: tirar etapas que hoje dependem de conversa, anotação e conferência manual e colocar o pedido em um caminho mais claro."
      >
        <div className={styles.compareGrid}>
          <article className={styles.compareBox}>
            <h3>Quando tudo fica espalhado</h3>
            <ul>
              <li>Procurar produto, endereço e observação no meio das mensagens.</li>
              <li>Perguntar novamente dados de quem já comprou.</li>
              <li>Conferir manualmente o que já saiu e o que ainda está parado.</li>
              <li>Separar entrega, atendimento e fidelização em ferramentas diferentes.</li>
            </ul>
          </article>
          <article className={styles.compareBox} data-kind="after">
            <h3>Com o fluxo do PedeAqui</h3>
            <ul>
              <li>O cliente monta o próprio pedido no cardápio.</li>
              <li>Os dados necessários chegam junto com o pedido.</li>
              <li>A equipe acompanha cada etapa na operação.</li>
              <li>Entrega e benefícios ao cliente entram no mesmo ciclo quando ativados.</li>
            </ul>
          </article>
        </div>
      </MarketingSection>

      <MarketingSection
        tone="dark"
        eyebrow="Escolha o que quer conhecer"
        title="O PedeAqui pode começar simples e crescer junto com a operação."
        intro="Nem todo estabelecimento precisa usar todos os recursos. Por isso o comercial mostra o núcleo do pedido e explica separadamente os recursos que podem ser adicionados à rotina."
      >
        <MarketingCards cards={[
          { eyebrow: "Visão completa", title: "Todos os recursos", description: "Veja cardápio, clientes, impressão, entrega, cashback, pontos e outras áreas organizadas pelo que elas resolvem.", href: "/recursos" },
          { eyebrow: "Comercial", title: "Planos e condição Fundadores", description: "Entenda o modelo de contratação sem tabela técnica e sem preço inventado para recurso que ainda não possui valor público definido.", href: "/planos" },
          { eyebrow: "Acesso", title: "Já é cliente?", description: "Entre no painel pela nova tela de login, mantendo o mesmo acesso e as mesmas regras de segurança.", href: "/login" },
        ]} />
      </MarketingSection>

      <CommercialCta title="Quer ver o PedeAqui funcionando na sua rotina?" description="Crie sua conta ou entre no painel se você já usa o sistema." />
    </MarketingShell>
  );
}
