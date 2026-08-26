import type { Metadata } from "next";
import { LegalPage, legalPageStyles } from "@/components/legal/legal-page";
import { PEDEAQUI_LEGAL, PEDEAQUI_LEGAL_ADDRESS } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: "Informações legais",
  description: "Identificação empresarial e informações públicas do PedeAqui.",
};

export default function CompanyLegalPage() {
  return (
    <LegalPage
      title="Informações legais"
      subtitle="Identificação pública da empresa responsável pela operação do PedeAqui."
    >
      <section className={legalPageStyles.section}>
        <h2>Responsável empresarial</h2>
        <dl className={legalPageStyles.details}>
          <div>
            <dt>Marca / produto</dt>
            <dd>{PEDEAQUI_LEGAL.brand}</dd>
          </div>
          <div>
            <dt>Razão social</dt>
            <dd>{PEDEAQUI_LEGAL.legalName}</dd>
          </div>
          <div>
            <dt>CNPJ</dt>
            <dd>{PEDEAQUI_LEGAL.cnpj}</dd>
          </div>
          <div>
            <dt>Endereço empresarial</dt>
            <dd>{PEDEAQUI_LEGAL_ADDRESS}</dd>
          </div>
          <div>
            <dt>Telefone comercial</dt>
            <dd><a className={legalPageStyles.back} href={PEDEAQUI_LEGAL.phoneHref}>{PEDEAQUI_LEGAL.phoneDisplay}</a></dd>
          </div>
        </dl>
      </section>

      <section className={legalPageStyles.section}>
        <h2>Sobre o PedeAqui</h2>
        <p>
          O PedeAqui é uma plataforma de gestão de pedidos, cardápio digital e operação para estabelecimentos alimentícios.
          Restaurantes e demais estabelecimentos utilizam a plataforma para organizar pedidos e, quando habilitado, integrar canais de atendimento autorizados.
        </p>
      </section>

      <p className={legalPageStyles.meta}>Informações atualizadas em 26 de agosto de 2026.</p>
    </LegalPage>
  );
}
