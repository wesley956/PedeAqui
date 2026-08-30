import Link from "next/link";
import {
  CommercialCta,
  FlowSteps,
  MarketingCards,
  MarketingHero,
  MarketingSection,
  MarketingShell,
  marketingStyles as styles,
} from "@/components/marketing/marketing-shell";

export default function PedidosAtendimentoPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Pedidos e atendimento"
        title={<>O cliente termina o pedido. <span style={{ color: "var(--brand-primary)" }}>Sua equipe começa com tudo organizado.</span></>}
        description="O PedeAqui coloca as informações do pedido em um fluxo de trabalho claro para quem atende, prepara, imprime, separa ou encaminha para retirada e entrega."
      >
        <div className={styles.heroActions}>
          <Link href="/entrega-e-fidelizacao" className={styles.primaryButton}>Ver entrega e fidelização</Link>
          <Link href="/recursos" className={styles.secondaryButton}>Ver todos os recursos</Link>
        </div>
      </MarketingHero>

      <MarketingSection eyebrow="Depois da confirmação" title="Cada pedido mostra qual é a próxima ação." intro="O fluxo muda de acordo com os recursos que aquela loja usa. Impressão, preparo e entrega ajudam a operação, mas não são obrigatórios para o pedido existir.">
        <FlowSteps steps={[
          { title: "Pedido recebido", description: "Os dados escolhidos pelo cliente chegam juntos para a equipe conferir." },
          { title: "Equipe assume", description: "O estabelecimento aceita e conduz o pedido de acordo com o fluxo configurado." },
          { title: "Preparo ou separação", description: "Restaurante pode preparar; outros tipos de negócio podem separar o pedido sem forçar vocabulário de cozinha." },
          { title: "Retirada ou entrega", description: "Quando estiver pronto, o pedido segue para a forma de recebimento escolhida pelo cliente." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="soft" title="Menos procura em conversa. Mais informação no lugar certo." intro="O benefício aparece quando a equipe precisa decidir o que fazer, não em relatórios complicados.">
        <MarketingCards cards={[
          { eyebrow: "Pedido", title: "Itens, opções e observações juntos", description: "A equipe vê o que o cliente realmente escolheu sem precisar reconstruir o pedido lendo várias mensagens." },
          { eyebrow: "Cliente", title: "Dados úteis sem misturar a base inteira", description: "Nome, contato e endereço aparecem no contexto em que são necessários para atendimento e entrega." },
          { eyebrow: "Histórico", title: "O andamento não depende da memória de quem atendeu", description: "Cada etapa registrada ajuda a entender o que já aconteceu e o que ainda falta naquele pedido." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="dark" eyebrow="Impressão automática" title="Quando a operação usa impressora, o pedido pode chegar à produção sem copiar informação na mão." intro="A impressão é um apoio ao fluxo. Se não estiver configurada ou estiver indisponível, o pedido continua existindo no PedeAqui e a equipe segue pelo painel.">
        <div className={styles.splitGrid}>
          <div className={styles.darkStory}>
            <h3>Fluxo com impressão</h3>
            <div className={styles.storySteps}>
              <div className={styles.storyStep}><strong>Pedido entra no PedeAqui</strong><span>O registro do pedido é a parte principal.</span></div>
              <div className={styles.storyStep}><strong>Impressão recebe a solicitação</strong><span>Quando o agente está configurado para aquela operação.</span></div>
              <div className={styles.storyStep}><strong>Equipe começa o preparo</strong><span>A cozinha ou separação recebe uma referência física do pedido.</span></div>
            </div>
          </div>
          <div className={styles.darkStory}>
            <h3>Sem depender da impressora</h3>
            <p>O PedeAqui não transforma impressão em requisito para vender. O painel continua sendo a referência do pedido e a impressão entra como uma forma de agilizar a rotina quando estiver ativa.</p>
            <p>Isso também evita prometer que todo estabelecimento precisa montar a mesma estrutura para começar.</p>
          </div>
        </div>
      </MarketingSection>

      <CommercialCta title="Depois do preparo vem a entrega — e pode vir a próxima compra." description="Veja como bairros, entregadores e cashback se conectam depois que o pedido está pronto." />
    </MarketingShell>
  );
}
