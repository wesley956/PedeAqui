import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/features/auth/actions";

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <AuthCard title="Criar conta" subtitle="Comece a configurar sua operação.">
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Não foi possível criar a conta.</p> : null}
      <form action={signUpAction} style={{ display: "grid", gap: 14 }}>
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input label="Senha" name="password" type="password" autoComplete="new-password" required minLength={8} hint="Use ao menos 8 caracteres." />
        <Button type="submit">Criar conta</Button>
      </form>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Já possui conta? <Link href="/login" style={{ color: "var(--text)" }}>Entrar</Link>
      </p>
    </AuthCard>
  );
}
