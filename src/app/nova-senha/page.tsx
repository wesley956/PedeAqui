import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { updatePasswordAction } from "@/features/auth/actions";

const passwordErrors: Record<string, string> = {
  invalid_password: "Use uma senha com pelo menos 8 caracteres.",
  update_failed: "Não foi possível atualizar a senha. O link pode ter expirado ou a senha pode não atender às regras de segurança.",
};

export default async function NovaSenhaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <AuthCard title="Nova senha" subtitle="Defina uma nova senha para sua conta.">
      {params.error ? <Alert tone="danger">{passwordErrors[params.error] ?? "Não foi possível atualizar a senha."}</Alert> : null}
      <form action={updatePasswordAction} className={authStyles.form}>
        <Input label="Nova senha" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <Button type="submit">Salvar nova senha</Button>
      </form>
    </AuthCard>
  );
}
