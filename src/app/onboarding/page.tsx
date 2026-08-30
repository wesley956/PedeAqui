import { AuthCard } from "@/components/auth/auth-card";
import { ModularOnboardingForm } from "@/features/onboarding/modular-onboarding-form";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { CommercialCatalogService } from "@/server/billing/commercial-catalog-service";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  await requireAuthenticatedUser();
  const params = await searchParams;
  const [plans, trialDays] = await Promise.all([
    CommercialCatalogService.listPublicPlans(),
    CommercialCatalogService.getTrialDays(),
  ]);
  const selectedPlanKey = plans.some((plan) => plan.key === params.plan) ? params.plan : plans[0]?.key;

  return (
    <AuthCard title="Configure seu PedeAqui" subtitle={`Seu teste de ${trialDays} dias começa quando esta configuração for concluída.`}>
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Não foi possível concluir a configuração. Revise os dados e tente novamente.</p> : null}
      <ModularOnboardingForm
        plans={plans.map((plan) => ({ key: plan.key, name: plan.name, monthlyPriceCents: plan.monthlyPriceCents }))}
        initialPlanKey={selectedPlanKey}
        trialDays={trialDays}
      />
    </AuthCard>
  );
}
