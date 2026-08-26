import type { Metadata } from "next";
import { LegalPage, legalPageStyles } from "@/components/legal/legal-page";
import { PEDEAQUI_LEGAL } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de Privacidade do PedeAqui.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      subtitle="Como o PedeAqui trata dados necessários para contas, pedidos, atendimento e integrações autorizadas."
    >
      <section className={legalPageStyles.section}>
        <h2>1. Quem é o responsável</h2>
        <p>
          O PedeAqui é operado sob responsabilidade empresarial de {PEDEAQUI_LEGAL.legalName}, CNPJ {PEDEAQUI_LEGAL.cnpj}.
          Esta política se aplica aos serviços e páginas do PedeAqui.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>2. Dados que podem ser tratados</h2>
        <ul>
          <li>dados de cadastro e autenticação de usuários da plataforma;</li>
          <li>dados do estabelecimento, equipe, cardápio, clientes e pedidos inseridos durante a operação;</li>
          <li>dados técnicos de acesso, segurança e diagnóstico necessários para manter o serviço;</li>
          <li>dados de integrações autorizadas pelo estabelecimento, inclusive identificadores de contas, números, mensagens e metadados necessários quando houver integração com WhatsApp Business ou outros provedores.</li>
        </ul>
      </section>

      <section className={legalPageStyles.section}>
        <h2>3. Finalidades</h2>
        <p>
          Os dados são utilizados para fornecer o serviço contratado, processar e organizar pedidos, permitir atendimento ao cliente,
          administrar acessos, prevenir fraude e abuso, oferecer suporte, cumprir obrigações legais e operar integrações solicitadas pelo estabelecimento.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>4. Compartilhamento e integrações</h2>
        <p>
          O PedeAqui pode utilizar provedores de infraestrutura, autenticação, mensageria, pagamento e outros serviços necessários à operação.
          Quando o estabelecimento habilita uma integração de terceiros, os dados estritamente necessários podem ser enviados ou recebidos desse provedor conforme a autorização concedida e as regras do respectivo serviço.
          O PedeAqui não comercializa dados pessoais como produto.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>5. WhatsApp Business e Meta</h2>
        <p>
          A integração com WhatsApp Business é opcional e depende de autorização do estabelecimento e das permissões disponibilizadas pela Meta.
          Quando ativada, o PedeAqui pode processar mensagens, identificadores da conta do WhatsApp Business e metadados necessários para entregar os recursos de atendimento contratados.
          O uso dessas integrações também está sujeito aos termos e políticas da Meta e do WhatsApp.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>6. Segurança e retenção</h2>
        <p>
          São adotadas medidas técnicas e organizacionais voltadas à proteção das informações e ao controle de acesso.
          Os dados são mantidos pelo período necessário à prestação do serviço, ao cumprimento de obrigações legais, à segurança da operação e ao exercício regular de direitos.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>7. Direitos e contato</h2>
        <p>
          Solicitações relacionadas a acesso, correção, atualização ou outras questões sobre dados podem ser encaminhadas pelo telefone comercial
          {" "}<a className={legalPageStyles.back} href={PEDEAQUI_LEGAL.phoneHref}>{PEDEAQUI_LEGAL.phoneDisplay}</a>.
        </p>
      </section>

      <p className={legalPageStyles.meta}>Última atualização: 26 de agosto de 2026.</p>
    </LegalPage>
  );
}
