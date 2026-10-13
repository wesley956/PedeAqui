import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";

export default function AcessoNegadoPage() {
  return (
    <section style={{ maxWidth: "var(--content-reading)", display: "grid", gap: "var(--space-4)" }}>
      <PageHeader title="Acesso não configurado" />
      <Alert tone="warning" title="Nenhuma área operacional disponível">
        Sua conta está autenticada, mas não há uma área do painel liberada pelas permissões atuais. Peça ao responsável pela operação para revisar seu perfil de acesso.
      </Alert>
      <Link href="/">Tentar novamente</Link>
    </section>
  );
}
