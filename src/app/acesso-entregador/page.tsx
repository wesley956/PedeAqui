import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { signInAction } from "@/features/auth/actions";
import { getAuthenticatedUser } from "@/server/auth/session";
import { redirect } from "next/navigation";

const loginErrors: Record<string, string> = {
  session_expired: "Sua sessão expirou. Entre novamente para continuar.",
  invalid_input: "Revise o e-mail e a senha informados.",
  invalid_credentials: "Não foi possível entrar. Verifique o e-mail e a senha.",
  auth_unavailable: "A autenticação está temporariamente indisponível. Tente novamente em instantes.",
};

export default async function DriverAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (user) redirect("/entregador");

  const params = await searchParams;

  return (
    <AuthCard
      title="Acesso do entregador"
      subtitle="Entre com o e-mail liberado pela loja para acessar somente suas entregas."
    >
      {params.error ? (
        <Alert tone="danger">{loginErrors[params.error] ?? "Não foi possível entrar. Verifique os dados."}</Alert>
      ) : null}

      <form action={signInAction} className={authStyles.form}>
        <input type="hidden" name="next" value="/entregador" />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input label="Senha" name="password" type="password" autoComplete="current-password" required minLength={8} />
        <Button type="submit">Entrar como entregador</Button>
      </form>

      <p className={authStyles.note}>
        Primeiro acesso? Use o link de convite enviado pela loja para criar e vincular sua conta.
      </p>
      <div className={authStyles.links}>
        <Link href="/recuperar-senha" className={authStyles.linkMuted}>Esqueci a senha</Link>
        <Link href="/login" className={authStyles.link}>Acesso da loja</Link>
      </div>
      <div className={authStyles.appearance}>
        <ThemeSelector />
      </div>
    </AuthCard>
  );
}
