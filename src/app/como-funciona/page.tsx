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

export default function ComoFuncionaPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Como funciona"
        title={<>Um pedido simples para o cliente e <span style={{ color: "var(--brand-primary)" }}>claro para quem atende.</span></>}
        description="O PedeAqui conduz cada etapa sem exigir que o cliente entenda o sistema. Ele escolhe o que quer, informa o necessário e acompanha o pedido depois da confirmação."
      >
        <div className={styles.heroActions}>
          <Link href="/cadastro" className={styles.primaryButton}>Criar minha conta</Link>
          <Link href="/pedidos-e-atendimento" className={styles.secondaryButton}>E depois do pedido?</Link>
        </div>
      </MarketingHero>

      <MarketingSection
        eyebrow="A jornada"
        title="Do link até a confirmação, sem misturar etapas."
        intro="A tela mostra somente o que faz sentido para aquela compra. Entrega, retirada e formas de pagamento aparecem de acordo com o que o estabelecimento configurou."
      >
        <FlowSteps steps={[
          { title: "Abre o cardápio", description: "O cliente entra pelo link do estabelecimento no celular ou navegador." },
          { title: "Escolhe o pedido", description: "Seleciona produtos, sabores, opções e complementos quando estiverem disponíveis." },
          { title: "Revisa o carrinho", description: "Confere itens, quantidades, observações e o valor antes de continuar." },
          { title: "Escolhe como receber", description: "Entrega e retirada aparecem somente quando aquela loja oferece essas opções." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="soft" title="Na hora de finalizar, o PedeAqui pede só o que precisa." intro="Se for entrega, entra o endereço. Se for retirada, essa etapa não é exigida. Nome e WhatsApp identificam o cliente e a forma de pagamento vem das opções habilitadas pela loja.">
        <MarketingCards cards={[
          { eyebrow: "Entrega", title: "Endereço e bairro entram no momento certo", description: "O endereço aparece quando a compra será entregue. A área atendida e a taxa são conferidas antes da confirmação." },
          { eyebrow: "Cliente", title: "Quem já comprou não precisa recomeçar do zero", description: "Quando o reconhecimento seguro estiver disponível para aquele cliente, endereços já usados podem facilitar um novo pedido." },
          { eyebrow: "Pagamento", title: "O cliente vê o que a loja realmente aceita", description: "Dinheiro, cartão presencial e outros métodos aparecem conforme a configuração do estabelecimento. PIX não é uma obrigação do sistema." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="dark" eyebrow="Depois de confirmar" title="O pedido não some depois do botão final." intro="A confirmação leva para um acompanhamento que mostra o estado real do pedido. O caminho muda conforme entrega ou retirada, sem inventar etapas que aquela operação não usa.">
        <div className={styles.splitGrid}>
          <div className={styles.darkStory}>
            <h3>Exemplo de entrega</h3>
            <div className={styles.storySteps}>
              <div className={styles.storyStep}><strong>Pedido recebido</strong><span>O estabelecimento já tem o pedido na operação.</span></div>
              <div className={styles.storyStep}><strong>Em preparação</strong><span>Quando esse estágio faz parte do fluxo configurado.</span></div>
              <div className={styles.storyStep}><strong>Saiu para entrega</strong><span>O cliente sabe que o pedido deixou o estabelecimento.</span></div>
              <div className={styles.storyStep}><strong>Entregue</strong><span>A jornada daquele pedido é concluída.</span></div>
            </div>
          </div>
          <div className={styles.darkStory}>
            <h3>Exemplo de retirada</h3>
            <div className={styles.storySteps}>
              <div className={styles.storyStep}><strong>Pedido recebido</strong><span>Sem pedir endereço de entrega.</span></div>
              <div className={styles.storyStep}><strong>Em preparação</strong><span>A equipe trabalha o pedido no fluxo da loja.</span></div>
              <div className={styles.storyStep}><strong>Pronto para retirada</strong><span>O cliente sabe quando pode buscar.</span></div>
              <div className={styles.storyStep}><strong>Retirado</strong><span>Pedido concluído no balcão.</span></div>
            </div>
          </div>
        </div>
      </MarketingSection>

      <CommercialCta title="Quer saber o que sua equipe vê depois?" description="Continue pela parte de pedidos e atendimento ou crie sua conta para conhecer o sistema." />
    </MarketingShell>
  );
}
