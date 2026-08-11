import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordResetAction } from "@/features/auth/actions";

export default async function RecuperarSenhaPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const params = await searchParams;

  return (
    <AuthCard title="Recuperar senha" subtitle="Enviaremos as instruções para o e-mail informado.">
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Informe um e-mail válido.</p> : null}
      {params.status === "sent" ? <p style={{ margin: 0, color: "var(--success)" }}>Se a conta existir, as instruções foram enviadas.</p> : null}
      <form action={requestPasswordResetAction} style={{ display: "grid", gap: 14 }}>
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Button type="submit">Enviar instruções</Button>
      </form>
      <Link href="/login" className="muted" style={{ fontSize: 14 }}>Voltar para entrar</Link>
    </AuthCard>
  );
}
