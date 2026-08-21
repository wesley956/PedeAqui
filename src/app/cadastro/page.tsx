import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/features/auth/actions";

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const loginHref = params.next ? `/login?next=${encodeURIComponent(params.next)}` : "/login";

  return (
    <AuthCard title="Criar conta" subtitle={params.next ? "Crie sua conta para concluir o acesso recebido." : "Comece a configurar sua operação."}>
      {params.error ? <Alert tone="danger">Não foi possível criar a conta.</Alert> : null}
      <form action={signUpAction} className={authStyles.form}>
        <input type="hidden" name="next" value={params.next ?? ""} />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input label="Senha" name="password" type="password" autoComplete="new-password" required minLength={8} hint="Use ao menos 8 caracteres." />
        <Button type="submit">Criar conta</Button>
      </form>
      <p className={authStyles.note}>
        Já possui conta? <Link href={loginHref} className={authStyles.link}>Entrar</Link>
      </p>
    </AuthCard>
  );
}
