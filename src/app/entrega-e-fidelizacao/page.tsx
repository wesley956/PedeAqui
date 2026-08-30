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

export default function EntregaFidelizacaoPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Entrega e fidelização"
        title={<>O pedido sai da loja. <span style={{ color: "var(--brand-primary)" }}>A relação com o cliente não precisa acabar ali.</span></>}
        description="O PedeAqui organiza bairros, taxas e o trabalho de entrega quando esses recursos estão ativos. Depois da conclusão, cashback, pontos e cupons podem ajudar a trazer o cliente de volta."
      >
        <div className={styles.heroActions}>
          <Link href="/recursos" className={styles.primaryButton}>Ver todos os recursos</Link>
          <Link href="/planos" className={styles.secondaryButton}>Conhecer os planos</Link>
        </div>
      </MarketingHero>

      <MarketingSection eyebrow="Entrega" title="Antes de sair com o pedido, a regra da entrega já está definida." intro="A loja configura onde atende e como trabalha. O cliente não precisa descobrir a taxa depois de concluir o pedido.">
        <MarketingCards cards={[
          { eyebrow: "Área atendida", title: "Cadastre os bairros onde você entrega", description: "A operação define as regiões atendidas e o checkout usa essa configuração para validar a entrega." },
          { eyebrow: "Taxa", title: "A cobrança entra antes da confirmação", description: "A taxa de entrega faz parte do cálculo do pedido conforme a regra cadastrada para aquela região." },
          { eyebrow: "Retirada", title: "Nem todo pedido precisa virar entrega", description: "Se a loja também oferece retirada, o cliente pode escolher essa opção sem preencher endereço de entrega." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="soft" title="Quando há entregador, ele recebe uma rotina própria — não o painel inteiro da loja." intro="A área do entregador foi pensada para celular e mostra apenas o necessário para fazer a entrega autorizada, sem expor as áreas administrativas do estabelecimento.">
        <FlowSteps steps={[
          { title: "Entrega é atribuída", description: "O pedido pronto pode ser encaminhado ao entregador permitido pela loja." },
          { title: "Entregador abre seu roteiro", description: "Ele entra em uma área própria com as entregas que pode visualizar." },
          { title: "Retira e sai", description: "A próxima ação fica clara para reduzir dúvida durante a rota." },
          { title: "Confirma a entrega", description: "Ao concluir, o pedido avança pelo fluxo oficial e mantém o histórico." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="dark" eyebrow="Cashback" title="Entregou? Agora você pode dar um motivo para o cliente voltar." intro="O cashback do PedeAqui é ligado ao cliente e ao pedido concluído. A loja define as regras e o saldo pode ser usado em uma compra futura quando estiver elegível.">
        <div className={styles.splitGrid}>
          <div className={styles.darkStory}>
            <h3>Como o cashback acontece</h3>
            <div className={styles.storySteps}>
              <div className={styles.storyStep}><strong>1. Pedido é concluído</strong><span>O benefício é gerado de acordo com a regra configurada pela loja.</span></div>
              <div className={styles.storyStep}><strong>2. Cliente acumula saldo</strong><span>O saldo fica associado ao cliente e mantém o histórico das movimentações.</span></div>
              <div className={styles.storyStep}><strong>3. Usa em outro pedido</strong><span>Quando estiver elegível, o cliente pode aplicar o cashback no checkout.</span></div>
              <div className={styles.storyStep}><strong>4. O cliente volta</strong><span>O benefício é usado na própria jornada de compra do PedeAqui.</span></div>
            </div>
          </div>
          <div className={styles.darkStory}>
            <h3>Sem saldo duplicado ou desconto escondido</h3>
            <p>O PedeAqui registra o ganho e o uso do cashback e evita conceder o mesmo benefício duas vezes para o mesmo evento.</p>
            <p>Se um pedido for rejeitado ou cancelado, os benefícios usados ou gerados são tratados de forma compensatória. E o cashback não reduz a taxa de entrega: ele atua sobre a parte elegível da compra.</p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection tone="orange" eyebrow="Outras formas de fidelizar" title="Cashback não precisa trabalhar sozinho." intro="O núcleo de crescimento também suporta cupons e pontos. Cada loja escolhe o que faz sentido e o cliente vê os benefícios disponíveis no momento adequado.">
        <MarketingCards cards={[
          { eyebrow: "Cupons", title: "Crie condições de desconto", description: "O cupom é conferido novamente na hora de fechar o pedido para evitar uso fora das regras." },
          { eyebrow: "Pontos", title: "Acumule e permita resgate", description: "Pontos podem ser ganhos e usados de acordo com as regras definidas para a operação." },
          { eyebrow: "Campanhas", title: "Prepare públicos para ações futuras", description: "O PedeAqui já organiza segmentos e campanhas. O envio por canais externos depende das integrações habilitadas e não é prometido como universal." },
        ]} />
      </MarketingSection>

      <CommercialCta title="Entrega concluída pode ser o começo do próximo pedido." description="Conheça os outros recursos ou veja como o PedeAqui é contratado." />
    </MarketingShell>
  );
}
