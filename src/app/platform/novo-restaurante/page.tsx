import Link from "next/link";
import { notFound } from "next/navigation";
import { provisionRestaurantAction } from "@/features/platform-commercial-onboarding/actions";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const inputStyle = {
  width: "100%",
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "11px 12px",
  fontSize: 16,
} as const;

const cardStyle = {
  border: "1px solid var(--border)",
  borderRadius: 16,
  background: "var(--surface)",
  padding: 18,
  display: "grid",
  gap: 14,
} as const;

export default async function NewRestaurantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") notFound();
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) notFound();
    throw error;
  }

  const params = await searchParams;
  const created = params.created === "1";
  const organizationId = typeof params.organizationId === "string" ? params.organizationId : null;
  const storeId = typeof params.storeId === "string" ? params.storeId : null;
  const slug = typeof params.slug === "string" ? params.slug : null;
  const invite = typeof params.invite === "string" ? params.invite : "not_requested";
  const error = typeof params.error === "string" ? params.error : null;
  const overviewHref = organizationId && storeId
    ? `/platform/empresas/${organizationId}/unidades/${storeId}`
    : storeId
      ? `/platform/unidades/${storeId}`
      : "/platform";

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "20px 14px 44px", display: "grid", gap: 18 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <Link href="/platform" style={{ fontSize: 13, fontWeight: 800 }}>← Painel do Proprietário</Link>
        <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>COMERCIAL · PEDEAQUI</p>
        <h1 style={{ margin: 0, fontSize: "clamp(28px, 7vw, 40px)" }}>Novo restaurante</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Crie a estrutura do cliente pelo celular. WhatsApp, pagamentos, impressão e cardápio podem ser configurados depois, sem bloquear o cadastro.
        </p>
      </header>

      {created && storeId && slug ? (
        <section style={{ ...cardStyle, borderColor: "var(--accent)" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "var(--accent)" }}>RESTAURANTE CRIADO</p>
            <h2 style={{ margin: "4px 0 0" }}>Estrutura pronta para configuração</h2>
          </div>
          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <span>✓ Empresa e primeira unidade criadas</span>
            <span>✓ Cardápio pode ser configurado agora</span>
            <span>✓ WhatsApp ficou <strong>pendente</strong> e não bloqueia a operação</span>
            <span>{invite === "sent" ? "✓ Convite do proprietário enviado por e-mail" : invite === "manual" ? "! E-mail informado, mas o convite automático precisa ser reenviado depois" : "○ Proprietário pode ser convidado depois"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <Link href={`/m/${slug}`} target="_blank" style={{ minHeight: 46, borderRadius: 12, background: "var(--accent)", color: "white", display: "grid", placeItems: "center", fontWeight: 900, textDecoration: "none", padding: "0 14px" }}>Abrir cardápio</Link>
            <Link href={overviewHref} style={{ minHeight: 46, borderRadius: 12, border: "1px solid var(--border)", display: "grid", placeItems: "center", fontWeight: 900, textDecoration: "none", padding: "0 14px" }}>Abrir visão 360</Link>
          </div>
          <Link href="/platform/novo-restaurante" style={{ fontWeight: 800 }}>Cadastrar outro restaurante</Link>
        </section>
      ) : (
        <form action={provisionRestaurantAction} style={cardStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Dados mínimos</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>Você pode completar endereço, telefone, cardápio e integrações depois.</p>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Nome da empresa</span>
            <input name="organizationName" required minLength={2} maxLength={120} placeholder="Ex.: Pizzaria do João" autoComplete="organization" style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Nome da primeira unidade</span>
            <input name="storeName" required minLength={2} maxLength={120} placeholder="Ex.: Pizzaria do João - Centro" style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>E-mail do proprietário <small className="muted">(opcional)</small></span>
            <input name="ownerEmail" type="email" maxLength={240} placeholder="Pode deixar em branco e convidar depois" autoComplete="email" style={inputStyle} />
          </label>

          <div style={{ padding: 13, borderRadius: 12, background: "var(--surface-2)", display: "grid", gap: 5 }}>
            <strong style={{ fontSize: 14 }}>WhatsApp</strong>
            <span className="muted" style={{ fontSize: 13 }}>Será criado como <strong>Configurar depois</strong>. Você não precisa saber o número do restaurante durante a apresentação.</span>
          </div>

          {error ? <p role="alert" style={{ margin: 0, fontWeight: 800 }}>Não foi possível concluir o cadastro. Revise os dados e tente novamente.</p> : null}
          <button type="submit" style={{ minHeight: 50, border: 0, borderRadius: 12, background: "var(--accent)", color: "white", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>Criar restaurante</button>
        </form>
      )}

      <section style={cardStyle}>
        <strong>Como usar na visita</strong>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, lineHeight: 1.45 }}>
          <li>Mostre a demonstração pelo celular.</li>
          <li>Se o cliente gostar, cadastre só o nome do restaurante.</li>
          <li>Configure o cardápio e operação sem depender do WhatsApp.</li>
          <li>Conecte o número do cliente depois, quando ele decidir qual vai usar.</li>
        </ol>
      </section>
    </main>
  );
}
