import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { driverPinSignInAction } from "@/features/delivery/driver-pin-auth-actions";

const loginErrors: Record<string, string> = {
  invalid_input: "Revise o telefone e informe um PIN de 6 números.",
  invalid_credentials: "Telefone ou PIN incorretos.",
  temporarily_locked: "Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.",
  access_unavailable: "Este acesso não está disponível no momento. Fale com a loja.",
};

export default async function DriverAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Acesso do entregador"
      subtitle="Entre com seu telefone e PIN para abrir diretamente o seu roteiro."
    >
      {params.error ? <Alert tone="danger">{loginErrors[params.error] ?? "Não foi possível entrar."}</Alert> : null}

      <form action={driverPinSignInAction} className={authStyles.form}>
        <Input
          label="Telefone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(19) 99999-9999"
          required
        />
        <Input
          label="PIN de 6 números"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
        />
        <Button type="submit">Abrir meu roteiro</Button>
      </form>

      <p className={authStyles.note}>
        Primeiro acesso? Abra o link enviado pela loja no WhatsApp e crie seu PIN uma única vez.
      </p>
      <p className={authStyles.note}>
        Depois de entrar, o celular permanece conectado normalmente até você sair da conta.
      </p>
      <div className={authStyles.links}>
        <Link href="/login" className={authStyles.link}>Acesso da loja</Link>
      </div>
      <div className={authStyles.appearance}><ThemeSelector /></div>
    </AuthCard>
  );
}
