import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import {
  PlatformWhatsAppManualError,
  PlatformWhatsAppManualService,
  type PlatformWhatsAppManualErrorCode,
} from "@/server/platform/platform-whatsapp-manual-service";
import { connectManualWhatsAppAction, revalidateManualWhatsAppAction } from "./actions";
import styles from "@/app/platform/platform.module.css";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const fieldStyle = {
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
  width: "100%",
} as const;

const errorMessages: Record<PlatformWhatsAppManualErrorCode | "unexpected", string> = {
  store_not_found: "A unidade não foi encontrada.",
  platform_token_missing: "Falta configurar o token técnico permanente do PedeAqui na Meta.",
  app_secret_missing: "Falta configurar o App Secret do WhatsApp no servidor.",
  graph_version_missing: "Falta configurar a versão da Graph API no servidor.",
  duplicate_phone: "Este Phone Number ID já está ligado a outra unidade.",
  phone_not_in_waba: "O Phone Number ID não pertence à WABA informada.",
  permanent_token_invalid: "A Meta recusou o token técnico permanente do PedeAqui.",
  system_user_not_assigned: "O System User do PedeAqui ainda não tem acesso a esta WABA/número.",
  meta_unavailable: "A Meta está temporariamente indisponível. Tente novamente.",
  meta_rejected: "A Meta recusou esta configuração. Revise os IDs e as permissões do ativo.",
  missing_current_ids: "Ainda não há WABA ID e Phone Number ID salvos para revalidar.",
  unexpected: "Não foi possível concluir a validação. Revise a configuração e tente novamente.",
};

function connectionLabel(value: string | null | undefined) {
  if (value === "connected") return "Conectado";
  if (value === "action_required") return "Ação necessária";
  if (value === "temporarily_unavailable") return "Meta indisponível";
  if (value === "revoked") return "Acesso revogado";
  if (value === "disconnected") return "Desconectado";
  return "Não conectado";
}

function credentialLabel(value: "permanent" | "legacy" | "missing") {
  if (value === "permanent") return "Token técnico permanente";
  if (value === "legacy") return "Credencial antiga — revalidar";
  return "Sem credencial vinculada";
}

export default async function PlatformManualWhatsAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  let data: Awaited<ReturnType<typeof PlatformWhatsAppManualService.load>>;
  try {
    data = await PlatformWhatsAppManualService.load(storeId);
  } catch (error) {
    if (error instanceof PlatformWhatsAppManualError && error.code === "store_not_found") notFound();
    throw error;
  }

  const settings = data.settings;
  const currentIds = Boolean(settings?.whatsapp_business_account_id && settings?.whatsapp_phone_number_id);
  const connected = settings?.connection_status === "connected" && settings?.whatsapp_enabled;
  const errorCode = query.error && query.error in errorMessages
    ? query.error as keyof typeof errorMessages
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Link href={`/platform/unidades/${storeId}`}>← Visão 360°</Link>
        <span>/</span>
        <strong>WhatsApp</strong>
      </div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PEDEAQUI · CONEXÃO MANUAL</p>
          <h1>{data.store.name}</h1>
          <p>{data.organization?.name ?? "Empresa"} · configuração técnica do WhatsApp Cloud API.</p>
        </div>
        <div className={styles.heroBadges}>
          <span className={styles.pill} data-tone={connected ? "good" : "warn"}>{connectionLabel(settings?.connection_status)}</span>
          <span className={styles.pill} data-tone={data.credentialMode === "permanent" ? "good" : "warn"}>{credentialLabel(data.credentialMode)}</span>
        </div>
      </header>

      {query.status === "connected" ? <Card><strong>WhatsApp validado e conectado.</strong><p className="muted" style={{ marginBottom: 0 }}>A Meta confirmou a WABA e o número usando o token técnico permanente do PedeAqui.</p></Card> : null}
      {query.status === "revalidated" ? <Card><strong>Conexão revalidada.</strong><p className="muted" style={{ marginBottom: 0 }}>A credencial antiga foi substituída pela referência ao token técnico permanente e o health check passou.</p></Card> : null}
      {errorCode ? <Card><strong>Não foi possível concluir.</strong><p className="muted" style={{ marginBottom: 0 }}>{errorMessages[errorCode]}</p></Card> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Estado atual</h2><p>Sem token exposto no navegador, no formulário ou no banco da unidade.</p></div>
        </div>
        <div className={styles.supportGrid}>
          <Info title="Conexão" value={connectionLabel(settings?.connection_status)} />
          <Info title="Credencial" value={credentialLabel(data.credentialMode)} />
          <Info title="Número" value={settings?.display_phone_number ?? (settings?.whatsapp_phone_number_id ? `ID ${settings.whatsapp_phone_number_id}` : "Não informado")} />
          <Info title="Nome verificado" value={settings?.verified_name ?? "Ainda não consultado"} />
          <Info title="Qualidade" value={settings?.quality_rating ?? "Ainda não consultada"} />
          <Info title="Último health check" value={settings?.last_health_check_at ? dateTime.format(new Date(settings.last_health_check_at)) : "Ainda não executado"} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Infraestrutura do PedeAqui</h2><p>O modo manual não depende do Embedded Signup, mas exige o token técnico permanente da plataforma.</p></div>
          <span className={styles.pill} data-tone={data.environment.ready ? "good" : "danger"}>{data.environment.ready ? "Pronta" : "Configuração pendente"}</span>
        </div>
        {data.environment.ready ? (
          <p className={styles.meta}>Token técnico, App Secret e versão da Graph API estão disponíveis no servidor. Os valores nunca são enviados ao navegador.</p>
        ) : (
          <div className={styles.operationPanel}>
            <strong>Falta configuração server-side</strong>
            <p className={styles.meta}>Pendência: {data.environment.missing.join(" · ")}. Depois de configurar, use Revalidar conexão nesta mesma tela.</p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Conectar número manualmente</h2><p>Primeiro adicione/atribua o número ao System User do PedeAqui na Meta. Depois informe os dois IDs abaixo.</p></div>
        </div>
        <form action={connectManualWhatsAppAction} style={{ display: "grid", gap: 14, maxWidth: 680 }}>
          <input type="hidden" name="storeId" value={storeId} />
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>WABA ID</span>
            <input name="wabaId" required inputMode="numeric" autoComplete="off" defaultValue={settings?.whatsapp_business_account_id ?? ""} style={fieldStyle} placeholder="Conta do WhatsApp Business" />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 800 }}>Phone Number ID</span>
            <input name="phoneNumberId" required inputMode="numeric" autoComplete="off" defaultValue={settings?.whatsapp_phone_number_id ?? ""} style={fieldStyle} placeholder="ID do número na Cloud API" />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button type="submit" disabled={!data.environment.ready}>Validar e conectar</Button>
          </div>
          <p className={styles.meta}>O PedeAqui verifica se o número pertence à WABA, inscreve o app na WABA, consulta o número na Meta e só então grava o estado como conectado.</p>
        </form>
      </section>

      {currentIds ? <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Revalidar / reparar</h2><p>Use para trocar uma conexão antiga pelo token técnico permanente ou confirmar que a Meta continua aceitando a credencial.</p></div>
        </div>
        <form action={revalidateManualWhatsAppAction}>
          <input type="hidden" name="storeId" value={storeId} />
          <Button type="submit" disabled={!data.environment.ready}>Revalidar conexão atual</Button>
        </form>
      </section> : null}
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return <article className={styles.supportCard}><strong>{title}</strong><span>{value}</span></article>;
}
