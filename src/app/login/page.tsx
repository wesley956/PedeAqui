import type { Metadata } from "next";
import Link from "next/link";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { signInAction } from "@/features/auth/actions";
import { PEDEAQUI_LEGAL } from "@/lib/legal/company";
import styles from "./login-commercial.module.css";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse o painel do PedeAqui para acompanhar pedidos, clientes e os recursos ativos da sua operação.",
};

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
    <main className={styles.root}>
      <section className={styles.story} aria-label="Apresentação PedeAqui">
        <Link href="/" className={styles.logoLink} aria-label="Voltar para o site do PedeAqui">
          <PedeAquiLogo size="md" surface="light" priority />
        </Link>

        <div className={styles.storyBody}>
          <span className={styles.storyEyebrow}>Sua operação começa aqui</span>
          <h1>Entre para cuidar dos pedidos sem perder tempo procurando informação.</h1>
          <p className={styles.storyLead}>Cardápio, pedidos, clientes, entrega e os recursos ativos da sua loja continuam no mesmo PedeAqui. Esta tela só ficou mais clara e mais alinhada ao produto que você usa.</p>
        </div>

        <div className={styles.storyPoints} aria-label="Benefícios do PedeAqui">
          <div className={styles.storyPoint}><strong>Pedidos</strong><span>Veja o que chegou e qual é a próxima ação.</span></div>
          <div className={styles.storyPoint}><strong>Operação</strong><span>Acompanhe preparo, retirada e entrega conforme sua loja.</span></div>
          <div className={styles.storyPoint}><strong>Clientes</strong><span>Mantenha o contexto necessário para atender melhor.</span></div>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.formCard}>
          <Link href="/" className={styles.backLink}>← Voltar para o site</Link>

          <div className={styles.formHeading}>
            <h2>Entrar no PedeAqui</h2>
            <p>Use o mesmo e-mail e a mesma senha da sua conta.</p>
          </div>

          {params.error ? <Alert tone="danger">{loginErrors[params.error] ?? "Não foi possível entrar. Verifique os dados."}</Alert> : null}
          {params.status === "check_email" ? <Alert tone="success">Confira seu e-mail para concluir o cadastro.</Alert> : null}

          <form action={signInAction} className={authStyles.form}>
            <input type="hidden" name="next" value={params.next ?? ""} />
            <Input label="E-mail" name="email" type="email" autoComplete="email" required />
            <Input label="Senha" name="password" type="password" autoComplete="current-password" required minLength={8} />
            <Button type="submit">Entrar</Button>
          </form>

          <div className={styles.links}>
            <Link href="/recuperar-senha">Esqueci a senha</Link>
            <Link href={signupHref}>Criar conta</Link>
          </div>

          <div className={styles.newAccount}>
            <strong>Ainda está conhecendo o PedeAqui?</strong>
            <p>Veja como o pedido funciona antes de criar sua conta.</p>
            <Link href="/como-funciona" className={styles.createLink}>Entender o fluxo do pedido</Link>
          </div>

          <div className={styles.appearance}>
            <ThemeSelector />
          </div>

          <footer className={styles.legal}>
            <p>Responsável empresarial: {PEDEAQUI_LEGAL.legalName} · CNPJ {PEDEAQUI_LEGAL.cnpj}</p>
            <nav aria-label="Informações legais do PedeAqui">
              <Link href="/empresa">Informações legais</Link>
              <Link href="/politica-de-privacidade">Privacidade</Link>
              <Link href="/termos-de-uso">Termos de uso</Link>
            </nav>
          </footer>
        </div>
      </section>
    </main>
  );
}
