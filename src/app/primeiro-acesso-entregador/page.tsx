import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import authStyles from "@/components/auth/auth-flow.module.css";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { activateDriverPinAction } from "@/features/delivery/driver-pin-auth-actions";
import { DriverPinAuthService } from "@/server/delivery/driver-pin-auth-service";

const errors: Record<string, string> = {
  pin_mismatch: "Os dois PINs precisam ser iguais.",
  invalid_pin: "Crie um PIN com exatamente 6 números.",
  expired: "Este link expirou ou já foi utilizado. Peça um novo acesso à loja.",
  account_conflict: "Esta conta possui outro perfil no PedeAqui. Peça à loja um acesso exclusivo de entregador.",
  phone_conflict: "Este telefone já está ligado a outra conta. Peça à loja para conferir o cadastro.",
  activation_failed: "Não foi possível concluir o primeiro acesso. Peça à loja para gerar um novo link.",
};

function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 13) return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.startsWith("55") && digits.length === 12) return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  return phone;
}

export default async function DriverFirstAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const preview = await DriverPinAuthService.previewEnrollment(token);

  if (!preview) {
    return <AuthCard title="Link de acesso inválido" subtitle="Este link expirou, já foi usado ou não pertence mais a um acesso ativo.">
      <Link href="/acesso-entregador">Ir para o acesso do entregador</Link>
    </AuthCard>;
  }

  return (
    <AuthCard
      title={`Olá, ${preview.driverName}`}
      subtitle={`Primeiro acesso em ${preview.storeName}. Confirme seu telefone e crie um PIN simples para entrar nas próximas vezes.`}
    >
      {params.error ? <Alert tone="danger">{errors[params.error] ?? errors.activation_failed}</Alert> : null}

      <div className={authStyles.note}>
        <strong>Telefone:</strong> {displayPhone(preview.phone)}
      </div>

      <form action={activateDriverPinAction} className={authStyles.form}>
        <input type="hidden" name="token" value={token} />
        <Input
          label="Crie seu PIN de 6 números"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
        />
        <Input
          label="Repita o PIN"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
        />
        <Button type="submit">Ativar e abrir meu roteiro</Button>
      </form>

      <p className={authStyles.note}>
        Depois desta ativação, este celular permanecerá conectado normalmente. Se precisar entrar novamente, será só telefone + PIN.
      </p>
      <div className={authStyles.appearance}><ThemeSelector /></div>
    </AuthCard>
  );
}
