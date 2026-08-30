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
  title: "Recursos",
  description: "Conheça os recursos do PedeAqui para vender, organizar pedidos, entregar, fidelizar clientes e administrar a operação.",
};

export default function RecursosPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Recursos"
        title={<>Veja o PedeAqui pelo que ele <span style={{ color: "var(--brand-primary)" }}>resolve na rotina.</span></>}
        description="Em vez de uma lista cheia de nomes técnicos, os recursos estão agrupados por objetivo: vender, operar, entregar, conhecer clientes e administrar o estabelecimento."
      >
        <div className={styles.heroActions}>
          <Link href="/como-funciona" className={styles.primaryButton}>Ver o fluxo completo</Link>
          <Link href="/planos" className={styles.secondaryButton}>Ver planos</Link>
        </div>
      </MarketingHero>

      <MarketingSection eyebrow="Vender e receber pedidos" title="O cliente encontra, escolhe e confirma sem depender de montar tudo por mensagem.">
        <MarketingCards cards={[
          { eyebrow: "Cardápio", title: "Link próprio para seus produtos", description: "Compartilhe o cardápio da loja e deixe o cliente navegar por categorias, fotos, preços e disponibilidade." },
          { eyebrow: "Produtos", title: "Opções, sabores e complementos", description: "Cadastre produtos com escolhas simples, quantidades por opção e complementos quando fizer sentido para o item." },
          { eyebrow: "Carrinho", title: "Revisão antes de continuar", description: "O cliente confere itens, opções, observações e valor antes de informar os dados finais." },
          { eyebrow: "Checkout", title: "Entrega, retirada e dados no momento certo", description: "A tela pede somente o que aquela compra precisa e mostra as opções realmente habilitadas pela loja." },
          { eyebrow: "Pagamento", title: "Mostre apenas o que você aceita", description: "Dinheiro, cartão presencial e outros meios configurados podem entrar no checkout sem obrigar PIX para todas as operações." },
          { eyebrow: "Acompanhamento", title: "O cliente vê o andamento depois", description: "Após confirmar, ele acompanha os estados reais do pedido conforme entrega ou retirada." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="soft" eyebrow="Operar o dia a dia" title="O pedido continua organizado depois que o cliente fecha a compra.">
        <MarketingCards cards={[
          { eyebrow: "Pedidos", title: "Veja o que chegou e o que falta fazer", description: "A equipe trabalha os pedidos em uma visão central, com informações e etapas ligadas à operação." },
          { eyebrow: "Preparo", title: "Cozinha, produção ou separação", description: "O fluxo se adapta ao tipo de negócio e aos recursos ativos, sem obrigar toda loja a usar as mesmas etapas." },
          { eyebrow: "Impressão", title: "Leve o pedido para a produção", description: "Quando configurada, a impressão automática ajuda a agilizar cozinha ou separação sem virar requisito para receber pedido." },
          { eyebrow: "Retirada", title: "Atenda quem prefere buscar", description: "Pedidos para retirada seguem um caminho próprio e não pedem endereço de entrega." },
          { eyebrow: "Entregas", title: "Organize bairros, taxas e andamento", description: "Defina a área atendida e acompanhe o pedido até a conclusão da entrega." },
          { eyebrow: "Entregadores", title: "Uma área própria para quem está na rua", description: "O entregador acessa somente o necessário para a rota e para concluir as entregas autorizadas." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="orange" eyebrow="Clientes e retorno" title="Use o histórico da relação para facilitar a próxima compra.">
        <MarketingCards cards={[
          { eyebrow: "Clientes", title: "Dados e endereços ligados aos pedidos", description: "A operação consegue localizar o cliente e seus dados dentro das regras de acesso e privacidade." },
          { eyebrow: "Cashback", title: "Saldo para uma compra futura", description: "A loja define a regra, o cliente acumula após eventos elegíveis e pode resgatar o saldo no checkout." },
          { eyebrow: "Pontos", title: "Crie outra forma de recompensa", description: "Pontos podem ser acumulados e usados conforme as regras da loja." },
          { eyebrow: "Cupons", title: "Desconto com regra, não só um código", description: "Cupons são validados na hora de fechar o pedido para respeitar limite e elegibilidade." },
          { eyebrow: "Segmentos", title: "Organize grupos de clientes", description: "A área de crescimento pode separar públicos por critérios da relação de compra." },
          { eyebrow: "Campanhas", title: "Prepare ações com públicos definidos", description: "Campanhas podem ser preparadas no sistema; o envio por WhatsApp ou e-mail depende do canal e da integração disponíveis." },
        ]} />
      </MarketingSection>

      <MarketingSection tone="dark" eyebrow="Administrar" title="Recursos entram conforme o tipo de negócio, o plano e a necessidade da operação." intro="O PedeAqui possui uma arquitetura modular. Para o cliente final isso significa uma coisa simples: a loja não precisa ligar tudo para começar e não precisa enxergar recurso que não faz sentido para sua rotina.">
        <MarketingCards cards={[
          { eyebrow: "Configurações", title: "Ajuste sua loja sem entrar em telas técnicas", description: "Horários, entrega, pagamentos, impressão e outros recursos ficam organizados pelo que você quer configurar." },
          { eyebrow: "Equipe", title: "Cada pessoa vê o que precisa usar", description: "Acesso ao sistema segue o papel e as permissões da equipe, sem liberar áreas administrativas para quem não precisa delas." },
          { eyebrow: "Módulos", title: "Comece com o necessário e adicione recursos", description: "Planos e recursos ativos são tratados separadamente para permitir evolução sem apagar o histórico da loja." },
        ]} />
      </MarketingSection>

      <CommercialCta title="Não precisa usar tudo para começar." description="Veja os planos ativos ou crie sua conta para conhecer o PedeAqui." />
    </MarketingShell>
  );
}
