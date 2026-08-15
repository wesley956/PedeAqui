import type { Metadata } from "next";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidade | PedeAqui",
  description: "Política de Privacidade do PedeAqui para cardápios, pedidos, atendimento e integrações.",
};

const updatedAt = "15 de agosto de 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.document}>
        <header className={styles.header}>
          <PedeAquiLogo size="lg" surface="dark" priority />
          <div>
            <p className={styles.eyebrow}>Privacidade e proteção de dados</p>
            <h1>Política de Privacidade</h1>
            <p className={styles.updated}>Última atualização: {updatedAt}</p>
          </div>
        </header>

        <section>
          <h2>1. Sobre esta política</h2>
          <p>
            Esta Política explica como o PedeAqui trata dados pessoais quando a plataforma é utilizada para acessar cardápios,
            realizar e acompanhar pedidos, receber atendimento e usar integrações habilitadas pelo estabelecimento, inclusive WhatsApp.
          </p>
        </section>

        <section>
          <h2>2. Dados que podem ser tratados</h2>
          <p>Conforme o fluxo utilizado e as configurações do estabelecimento, podem ser tratados:</p>
          <ul>
            <li>nome e número de telefone/WhatsApp;</li>
            <li>endereço de entrega e referências fornecidas pelo cliente;</li>
            <li>itens do pedido, adicionais, valores, forma e situação do pagamento;</li>
            <li>dados necessários ao acompanhamento da produção e entrega;</li>
            <li>mensagens e metadados técnicos de atendimento quando o WhatsApp estiver integrado;</li>
            <li>informações técnicas de segurança e operação, como registros de eventos e identificadores de sessão.</li>
          </ul>
        </section>

        <section>
          <h2>3. Para que usamos os dados</h2>
          <p>Os dados são utilizados apenas para finalidades relacionadas à operação do serviço, como:</p>
          <ul>
            <li>identificar o cliente e concluir o pedido solicitado;</li>
            <li>calcular entrega, registrar endereço e facilitar compras futuras de forma segura;</li>
            <li>processar ou registrar a forma de pagamento escolhida;</li>
            <li>encaminhar o pedido ao estabelecimento e permitir seu acompanhamento;</li>
            <li>enviar comunicações operacionais, como confirmação e atualização de entrega;</li>
            <li>prevenir fraude, duplicidade, abuso e incidentes de segurança;</li>
            <li>cumprir obrigações legais e manter a confiabilidade da plataforma.</li>
          </ul>
        </section>

        <section>
          <h2>4. WhatsApp e serviços de terceiros</h2>
          <p>
            Quando o estabelecimento habilita o WhatsApp, o PedeAqui pode usar a WhatsApp Business Platform, fornecida pela Meta,
            para receber mensagens e enviar respostas ou atualizações relacionadas ao atendimento e ao pedido. Outros serviços de
            pagamento, hospedagem ou infraestrutura podem ser utilizados somente quando necessários ao recurso contratado ou habilitado.
          </p>
        </section>

        <section>
          <h2>5. Compartilhamento</h2>
          <p>
            Os dados podem ser compartilhados com o estabelecimento responsável pelo pedido e com provedores estritamente necessários
            à operação, como serviços de mensageria, pagamento, hospedagem e infraestrutura. O PedeAqui não comercializa dados pessoais.
          </p>
        </section>

        <section>
          <h2>6. Segurança e retenção</h2>
          <p>
            Aplicamos controles técnicos e organizacionais destinados a proteger dados contra acesso não autorizado, alteração,
            divulgação ou perda indevida. Os dados são mantidos pelo período necessário às finalidades do serviço e às obrigações
            legais, regulatórias, fiscais, de segurança ou de defesa de direitos aplicáveis.
          </p>
        </section>

        <section>
          <h2>7. Direitos do titular</h2>
          <p>
            Nos termos da legislação aplicável, o titular pode solicitar informações sobre o tratamento, confirmação e acesso aos
            dados, correção, anonimização, bloqueio ou eliminação quando cabível, informações sobre compartilhamento e demais direitos
            previstos na Lei Geral de Proteção de Dados Pessoais (LGPD).
          </p>
          <p>
            Solicitações relacionadas a um pedido devem ser direcionadas prioritariamente ao estabelecimento responsável por esse pedido.
            Questões relativas à plataforma podem ser encaminhadas pelos canais oficiais de suporte disponibilizados no PedeAqui.
          </p>
        </section>

        <section>
          <h2>8. Exclusão de dados</h2>
          <p>
            O titular pode solicitar a exclusão de dados que não precisem ser mantidos por obrigação legal, regulatória ou para exercício
            regular de direitos. Para proteger o próprio titular, poderá ser necessária a confirmação de identidade antes do atendimento.
          </p>
        </section>

        <section>
          <h2>9. Alterações desta política</h2>
          <p>
            Esta Política pode ser atualizada para refletir mudanças legais, operacionais ou de segurança. A versão vigente ficará
            disponível permanentemente nesta página, com a data de atualização indicada no início do documento.
          </p>
        </section>
      </article>
    </main>
  );
}
