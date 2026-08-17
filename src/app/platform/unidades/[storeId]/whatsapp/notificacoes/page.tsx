import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import {
  PlatformWhatsAppOrderTemplateError,
  PlatformWhatsAppOrderTemplateService,
} from "@/server/platform/platform-whatsapp-order-template-service";
import { prepareOrderTemplateAction } from "./actions";
import styles from "@/app/platform/platform.module.css";

const statusLabels: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em análise na Meta",
  REJECTED: "Rejeitado pela Meta",
  PAUSED: "Pausado pela Meta",
  DISABLED: "Desativado pela Meta",
  MISSING: "Ainda não criado",
};

const errorLabels: Record<string, string> = {
  store_not_found: "Unidade não encontrada.",
  whatsapp_not_connected: "Conecte e revalide o WhatsApp antes de preparar as notificações.",
  waba_missing: "A unidade não possui WABA ID configurada.",
  platform_token_missing: "O token técnico permanente do PedeAqui não está disponível no servidor.",
  graph_version_missing: "A versão da Graph API não está configurada no servidor.",
  meta_unavailable: "A Meta está temporariamente indisponível.",
  meta_rejected: "A Meta recusou a criação ou consulta do template.",
  unexpected: "Não foi possível concluir a configuração do template.",
};

function tone(status: string) {
  if (status === "APPROVED") return "good";
  if (status === "PENDING" || status === "MISSING") return "warn";
  return "danger";
}

export default async function PlatformWhatsAppNotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ template?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  let state: Awaited<ReturnType<typeof PlatformWhatsAppOrderTemplateService.inspect>> | null = null;
  let loadError: string | null = null;
  try {
    state = await PlatformWhatsAppOrderTemplateService.inspect(storeId);
  } catch (error) {
    loadError = error instanceof PlatformWhatsAppOrderTemplateError ? error.code : "unexpected";
  }

  const errorCode = query.error ?? loadError;
  const message = errorCode ? (errorLabels[errorCode] ?? errorLabels.unexpected) : null;
  const currentStatus = state?.status ?? "MISSING";
  const approved = currentStatus === "APPROVED";

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Link href={`/platform/unidades/${storeId}/whatsapp`}>← WhatsApp da unidade</Link>
        <span>/</span>
        <strong>Notificações automáticas</strong>
      </div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PEDEAQUI · WHATSAPP TRANSACIONAL</p>
          <h1>Notificações automáticas do pedido</h1>
          <p>Pedido recebido, pagamento confirmado, pronto para retirada, saiu para entrega e pedido entregue.</p>
        </div>
        <div className={styles.heroBadges}>
          <span className={styles.pill} data-tone={tone(currentStatus)}>{statusLabels[currentStatus] ?? currentStatus}</span>
          <span className={styles.pill} data-tone={state?.notificationsEnabled ? "good" : "warn"}>{state?.notificationsEnabled ? "Notificações ativas" : "Aguardando ativação"}</span>
        </div>
      </header>

      {message ? <Card><strong>Não foi possível concluir.</strong><p className="muted" style={{ marginBottom: 0 }}>{message}</p></Card> : null}
      {query.template === "pending" ? <Card><strong>Template enviado para análise.</strong><p className="muted" style={{ marginBottom: 0 }}>A Meta recebeu o template. Use o mesmo botão novamente depois para consultar o status; quando ficar aprovado, o PedeAqui ativa todas as notificações automaticamente.</p></Card> : null}
      {query.template === "approved" ? <Card><strong>Template aprovado e notificações ativadas.</strong><p className="muted" style={{ marginBottom: 0 }}>O PedeAqui já pode usar texto normal dentro da janela de atendimento e o template aprovado fora dela.</p></Card> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Template oficial</h2><p>O template é criado na própria WABA da unidade usando o token técnico permanente do PedeAqui.</p></div>
          <span className={styles.pill} data-tone={tone(currentStatus)}>{statusLabels[currentStatus] ?? currentStatus}</span>
        </div>
        <div className={styles.supportGrid}>
          <Info title="Nome" value={state?.name ?? "pedeaqui_atualizacao_pedido"} />
          <Info title="Idioma" value={state?.language ?? "pt_BR"} />
          <Info title="Categoria" value={state?.category ?? "UTILITY"} />
          <Info title="Situação" value={statusLabels[currentStatus] ?? currentStatus} />
        </div>
        <div style={{ marginTop: 14 }}>
          <form action={prepareOrderTemplateAction}>
            <input type="hidden" name="storeId" value={storeId} />
            <Button type="submit">{currentStatus === "MISSING" ? "Criar template na Meta" : "Consultar e preparar template"}</Button>
          </form>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>O que será enviado</h2><p>As mensagens reagem aos estados já confirmados do pedido; uma falha do WhatsApp nunca altera cozinha, pagamento ou entrega.</p></div>
        </div>
        <div className={styles.supportGrid}>
          <Info title="Pedido recebido" value="Número do pedido + link de acompanhamento" />
          <Info title="Pagamento confirmado" value="Confirmação curta, sem dado financeiro sensível" />
          <Info title="Pronto para retirada" value="Somente para pedidos de retirada" />
          <Info title="Saiu para entrega" value="Somente para pedidos de delivery" />
          <Info title="Pedido entregue" value="Confirmação final do pedido" />
        </div>
      </section>

      <Card>
        <strong>{approved ? "Pronto para produção." : "Ainda falta a aprovação da Meta."}</strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          {approved
            ? "Dentro de 24 horas após a mensagem do cliente, o PedeAqui pode enviar texto normal; fora da janela, usa o template aprovado automaticamente."
            : "Enquanto o template não estiver aprovado, o PedeAqui mantém as notificações desativadas para não criar envios incompletos fora da janela de atendimento."}
        </p>
      </Card>
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return <article className={styles.supportCard}><strong>{title}</strong><span>{value}</span></article>;
}
