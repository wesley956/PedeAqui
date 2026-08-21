import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/features/team/actions";
import { getAuthenticatedUser } from "@/server/auth/session";

export default async function ConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getAuthenticatedUser();

  if (!params.token) {
    return (
      <AuthCard title="Convite inválido" subtitle="O link não possui um token de convite válido.">
        <Link href="/login">Ir para o login</Link>
      </AuthCard>
    );
  }

  if (!user) {
    const returnPath = `/convite?token=${params.token}`;
    const next = encodeURIComponent(returnPath);
    return (
      <AuthCard title="Acesso ao PedeAqui" subtitle="Entre ou crie sua conta usando o mesmo e-mail informado pelo estabelecimento.">
        <div style={{ display: "grid", gap: 10 }}>
          <Link href={`/login?next=${next}`}>Já tenho conta · Entrar</Link>
          <Link href={`/cadastro?next=${next}`}>Primeiro acesso · Criar conta</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Aceitar convite" subtitle="Confirme para entrar na organização e unidades liberadas para você.">
      {params.error ? <p role="alert" style={{ color: "#ff8a93", margin: 0 }}>Não foi possível aceitar este convite. Ele pode estar expirado ou pertencer a outro e-mail.</p> : null}
      <form action={acceptInvitationAction}>
        <input type="hidden" name="token" value={params.token} />
        <Button type="submit">Aceitar convite</Button>
      </form>
    </AuthCard>
  );
}
