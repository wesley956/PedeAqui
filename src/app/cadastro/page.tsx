import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/features/auth/actions";
import { CommercialCatalogService, formatCommercialPrice } from "@/server/billing/commercial-catalog-service";

const errorMessages: Record<string, string> = {
  invalid_input: "Confira o e-mail e use uma senha com pelo menos 8 caracteres.",
  email_exists: "Já existe uma conta com este e-mail. Entre na sua conta ou recupere sua senha.",
  signup_failed: "Não foi possível criar a conta. Tente novamente.",
};

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; plan?: string }> }) {
  const params = await searchParams;
  const [plans, trialDays] = await Promise.all([
    CommercialCatalogService.listPublicPlans(),
    CommercialCatalogService.getTrialDays(),
  ]);
  const selected = plans.find((plan) => plan.key === params.plan) ?? null;
  const next = selected ? `/onboarding?plan=${selected.key}` : (params.next ?? "/onboarding");
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard title="Criar conta" subtitle={`Comece com ${trialDays} dias grátis. Você só paga para continuar depois do teste.`}>
      {params.error ? <Alert tone="danger">{errorMessages[params.error] ?? errorMessages.signup_failed}</Alert> : null}

      {selected ? (
        <Alert tone="info">
          Plano {selected.name} · {formatCommercialPrice(selected.monthlyPriceCents, selected.currency)}/mês após o teste. <Link href="/cadastro">Trocar plano</Link>
        </Alert>
      ) : (
        <div className={authStyles.form}>
          <strong>Escolha seu plano para iniciar o teste:</strong>
          {plans.map((plan) => (
            <Link key={plan.key} href={`/cadastro?plan=${plan.key}`} className={authStyles.link}>
              {plan.name} — {formatCommercialPrice(plan.monthlyPriceCents, plan.currency)}/mês
            </Link>
          ))}
        </div>
      )}

      <form action={signUpAction} className={authStyles.form}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="plan" value={selected?.key ?? ""} />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input label="Senha" name="password" type="password" autoComplete="new-password" required minLength={8} hint="Use ao menos 8 caracteres." />
        <Button type="submit" disabled={!selected}>Começar teste grátis</Button>
      </form>
      {!selected ? <p className={authStyles.note}>Selecione um dos três planos acima para continuar.</p> : null}
      <p className={authStyles.note}>
        Já possui conta? <Link href={loginHref} className={authStyles.link}>Entrar</Link>
      </p>
    </AuthCard>
  );
}
