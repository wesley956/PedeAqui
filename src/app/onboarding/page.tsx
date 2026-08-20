import { AuthCard } from "@/components/auth/auth-card";
import { ModularOnboardingForm } from "@/features/onboarding/modular-onboarding-form";
import { requireAuthenticatedUser } from "@/server/auth/session";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAuthenticatedUser();
  const params = await searchParams;

  return (
    <AuthCard title="Configure seu PedeAqui" subtitle="Vamos mostrar somente as ferramentas que combinam com a sua operação.">
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Não foi possível concluir a configuração. Seus dados preenchidos podem ser revisados e enviados novamente.</p> : null}
      <ModularOnboardingForm />
    </AuthCard>
  );
}
