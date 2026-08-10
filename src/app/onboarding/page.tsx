import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bootstrapOrganizationAction } from "@/features/onboarding/actions";
import { requireAuthenticatedUser } from "@/server/auth/session";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAuthenticatedUser();
  const params = await searchParams;

  return (
    <AuthCard title="Configure sua empresa" subtitle="Crie a organização e a primeira unidade para começar.">
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Não foi possível concluir a configuração.</p> : null}
      <form action={bootstrapOrganizationAction} style={{ display: "grid", gap: 14 }}>
        <Input label="Nome da empresa" name="organizationName" required maxLength={120} placeholder="Ex.: Grupo Cruz" />
        <Input label="Nome da primeira unidade" name="storeName" required maxLength={120} placeholder="Ex.: Loja Centro" />
        <Button type="submit">Criar empresa e unidade</Button>
      </form>
    </AuthCard>
  );
}
