import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePasswordAction } from "@/features/auth/actions";

export default async function NovaSenhaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <AuthCard title="Nova senha" subtitle="Defina uma nova senha para sua conta.">
      {params.error ? <p role="alert" style={{ margin: 0, color: "#ff8a93" }}>Não foi possível atualizar a senha.</p> : null}
      <form action={updatePasswordAction} style={{ display: "grid", gap: 14 }}>
        <Input label="Nova senha" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <Button type="submit">Salvar nova senha</Button>
      </form>
    </AuthCard>
  );
}
