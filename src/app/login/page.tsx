import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/features/auth/actions";
import { ThemeSelector } from "@/components/theme/theme-selector";

const loginErrors: Record<string, string> = {
  session_expired: "Sua sessão expirou. Entre novamente para continuar.",
  auth_callback: "O link de autenticação é inválido ou expirou. Solicite um novo link e tente novamente.",
  invalid_input: "Revise o e-mail e a senha informados.",
  invalid_credentials: "Não foi possível entrar. Verifique o e-mail e a senha.",
  auth_unavailable: "A autenticação está temporariamente indisponível. Tente novamente em instantes.",
  too_many_attempts: "Muitas tentativas seguidas. Aguarde 15 minutos antes de tentar novamente.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; next?: string }>;
}) {
  const params = await searchParams;
  const signupHref = params.next ? `/cadastro?next=${encodeURIComponent(params.next)}` : "/cadastro";

  return (
    <AuthCard title="Entrar" subtitle="Acesse sua operação PedeAqui.">
      {params.error ? <Alert tone="danger">{loginErrors[params.error] ?? "Não foi possível entrar. Verifique os dados."}</Alert> : null}
      {params.status === "check_email" ? <Alert tone="success">Confira seu e-mail para concluir o cadastro.</Alert> : null}
      <form action={signInAction} className={authStyles.form}>
        <input type="hidden" name="next" value={params.next ?? ""} />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input label="Senha" name="password" type="password" autoComplete="current-password" required minLength={8} />
        <Button type="submit">Entrar</Button>
      </form>
      <div className={authStyles.links}>
        <Link href="/recuperar-senha" className={authStyles.linkMuted}>Esqueci a senha</Link>
        <Link href={signupHref} className={authStyles.link}>Criar conta</Link>
      </div>
      <div className={authStyles.appearance}>
        <ThemeSelector />
      </div>
    </AuthCard>
  );
}
