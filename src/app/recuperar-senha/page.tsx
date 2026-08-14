import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { requestPasswordResetAction } from "@/features/auth/actions";

export default async function RecuperarSenhaPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const params = await searchParams;

  return (
    <AuthCard title="Recuperar senha" subtitle="Enviaremos as instruções para o e-mail informado.">
      {params.error ? <Alert tone="danger">Informe um e-mail válido.</Alert> : null}
      {params.status === "sent" ? <Alert tone="success">Se a conta existir, as instruções foram enviadas.</Alert> : null}
      <form action={requestPasswordResetAction} className={authStyles.form}>
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Button type="submit">Enviar instruções</Button>
      </form>
      <Link href="/login" className={authStyles.linkMuted}>Voltar para entrar</Link>
    </AuthCard>
  );
}
