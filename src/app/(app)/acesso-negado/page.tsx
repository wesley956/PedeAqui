import Link from "next/link";
import { Alert } from "@/components/ui/feedback";

export default function AcessoNegadoPage() {
  return (
    <section style={{ maxWidth: "var(--content-reading)", display: "grid", gap: "var(--space-4)" }}>
      <h1 style={{ margin: 0 }}>Acesso não configurado</h1>
      <Alert tone="warning" title="Nenhuma área operacional disponível">
        Sua conta está autenticada, mas não há uma área do painel liberada pelas permissões atuais. Peça ao responsável pela operação para revisar seu perfil de acesso.
      </Alert>
      <Link href="/">Tentar novamente</Link>
    </section>
  );
}
