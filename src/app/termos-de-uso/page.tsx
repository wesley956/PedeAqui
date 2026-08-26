import type { Metadata } from "next";
import { LegalPage, legalPageStyles } from "@/components/legal/legal-page";
import { PEDEAQUI_LEGAL } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso do PedeAqui.",
};

export default function TermsOfUsePage() {
  return (
    <LegalPage
      title="Termos de Uso"
      subtitle="Condições gerais para utilização da plataforma PedeAqui."
    >
      <section className={legalPageStyles.section}>
        <h2>1. Serviço</h2>
        <p>
          O PedeAqui é uma plataforma de gestão de pedidos, cardápio digital, atendimento e recursos operacionais para estabelecimentos alimentícios.
          O serviço é disponibilizado sob responsabilidade empresarial de {PEDEAQUI_LEGAL.legalName}, CNPJ {PEDEAQUI_LEGAL.cnpj}.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>2. Contas e acesso</h2>
        <p>
          O estabelecimento é responsável por manter corretos os dados cadastrados, proteger suas credenciais e limitar o acesso da equipe às pessoas autorizadas.
          Atividades realizadas por usuários autorizados podem produzir efeitos na operação do estabelecimento.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>3. Operação do estabelecimento</h2>
        <p>
          O estabelecimento continua responsável por preços, produtos, disponibilidade, preparação, entrega, atendimento, tributos, documentos fiscais e demais obrigações relacionadas às suas vendas.
          O PedeAqui fornece ferramentas de software e não substitui o estabelecimento na relação comercial com o consumidor final.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>4. Integrações de terceiros</h2>
        <p>
          Recursos como WhatsApp Business, meios de pagamento e outros serviços externos dependem de provedores terceiros, de suas autorizações, disponibilidade e políticas.
          O estabelecimento somente deve conectar contas e números sobre os quais possua autorização legítima.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>5. Uso adequado</h2>
        <p>
          É proibido utilizar o PedeAqui para fraude, acesso não autorizado, envio abusivo de mensagens, violação de direitos de terceiros ou qualquer atividade ilícita.
          Recursos podem ser limitados ou suspensos quando necessário para preservar a segurança da plataforma ou atender exigências legais e de provedores integrados.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>6. Disponibilidade</h2>
        <p>
          O PedeAqui busca manter o serviço disponível e seguro, mas integrações, redes, serviços de nuvem e provedores externos podem sofrer indisponibilidades temporárias.
          Manutenções e atualizações podem ser realizadas para segurança, estabilidade e evolução do produto.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>7. Privacidade</h2>
        <p>
          O tratamento de informações relacionadas ao uso do PedeAqui é descrito na Política de Privacidade disponível publicamente neste site.
        </p>
      </section>

      <section className={legalPageStyles.section}>
        <h2>8. Contato</h2>
        <p>
          Dúvidas relacionadas ao serviço podem ser encaminhadas pelo telefone comercial
          {" "}<a className={legalPageStyles.back} href={PEDEAQUI_LEGAL.phoneHref}>{PEDEAQUI_LEGAL.phoneDisplay}</a>.
        </p>
      </section>

      <p className={legalPageStyles.meta}>Última atualização: 26 de agosto de 2026.</p>
    </LegalPage>
  );
}
