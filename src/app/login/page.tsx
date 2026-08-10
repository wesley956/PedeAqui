import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/features/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard title="Entrar" subtitle="Acesse sua operação Cruz.">
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Não foi possível entrar. Verifique os dados.</p> : null}
      {params.status === "check_email" ? <p style={{ margin: 0, color: "var(--success)" }}>Confira seu e-mail para concluir o cadastro.</p> : null}
      <form action={signInAction} style={{ display: "grid", gap: 14 }}>
        <input type="hidden" name="next" value={params.next ?? ""} />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input label="Senha" name="password" type="password" autoComplete="current-password" required minLength={8} />
        <Button type="submit">Entrar</Button>
      </form>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
        <Link href="/recuperar-senha" className="muted">Esqueci a senha</Link>
        <Link href="/cadastro">Criar conta</Link>
      </div>
    </AuthCard>
  );
}
