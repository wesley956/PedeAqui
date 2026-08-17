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
  TEST_WINDOW_ONLY: "Conta de teste · janela de 24h",
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
  if (status === "APPROVED" || status === "TEST_WINDOW_ONLY") return "good";
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
  const windowOnly = currentStatus === "TEST_WINDOW_ONLY";

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
          <span className={styles.pill} data-tone={state?.notificationsEnabled ? "good" : "warn"}>{state?.notificationsEnabled ? (windowOnly ? "Ativas por 24h" : "Notificações ativas") : "Aguardando ativação"}</span>
        </div>
      </header>

      {message && !state?.testAccount ? <Card><strong>Não foi possível concluir.</strong><p className="muted" style={{ marginBottom: 0 }}>{message}</p></Card> : null}
      {query.template === "pending" ? <Card><strong>Template enviado para análise.</strong><p className="muted" style={{ marginBottom: 0 }}>A Meta recebeu o template. Use o mesmo botão novamente depois para consultar o status; quando ficar aprovado, o PedeAqui ativa todas as notificações automaticamente.</p></Card> : null}
      {query.template === "approved" ? <Card><strong>Template aprovado e notificações ativadas.</strong><p className="muted" style={{ marginBottom: 0 }}>O PedeAqui já pode usar texto normal dentro da janela de atendimento e o template aprovado fora dela.</p></Card> : null}
      {query.template === "test_window_only" || windowOnly ? <Card><strong>Modo de homologação ativo.</strong><p className="muted" style={{ marginBottom: 0 }}>Esta WABA é a conta de teste da Meta. As notificações automáticas estão habilitadas durante a janela de atendimento de 24 horas aberta pela última mensagem do cliente. Fora dessa janela, o PedeAqui bloqueia o envio até existir um template aprovado em uma WABA comercial.</p></Card> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>{state?.testAccount ? "Conta de teste da Meta" : "Template oficial"}</h2><p>{state?.testAccount ? "A conta de teste usa a janela de atendimento para homologar o fluxo automático sem forçar um template customizado que a Meta não aceita nessa WABA." : "O template é criado na própria WABA da unidade usando o token técnico permanente do PedeAqui."}</p></div>
          <span className={styles.pill} data-tone={tone(currentStatus)}>{statusLabels[currentStatus] ?? currentStatus}</span>
        </div>
        <div className={styles.supportGrid}>
          <Info title="Conta" value={state?.accountName ?? "WABA da unidade"} />
          <Info title="Nome do template" value={state?.name ?? "pedeaqui_atualizacao_pedido"} />
          <Info title="Idioma" value={state?.language ?? "pt_BR"} />
          <Info title="Categoria" value={state?.category ?? (state?.testAccount ? "Não aplicável no modo de teste" : "UTILITY")} />
          <Info title="Situação" value={statusLabels[currentStatus] ?? currentStatus} />
        </div>
        <div style={{ marginTop: 14 }}>
          <form action={prepareOrderTemplateAction}>
            <input type="hidden" name="storeId" value={storeId} />
            <Button type="submit">{state?.testAccount ? (windowOnly ? "Revalidar modo de teste" : "Ativar notificações para teste") : (currentStatus === "MISSING" ? "Criar template na Meta" : "Consultar e preparar template")}</Button>
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
        <strong>{approved ? "Pronto para produção 24/7." : windowOnly ? "Pronto para homologação real dentro da janela de 24h." : "Ainda falta a aprovação da Meta."}</strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          {approved
            ? "Dentro de 24 horas após a mensagem do cliente, o PedeAqui envia texto normal; fora da janela, usa o template aprovado automaticamente."
            : windowOnly
              ? "Você acabou de abrir a janela de 24 horas ao enviar uma mensagem para o número de teste. Podemos criar um novo pedido agora e validar todas as notificações automáticas permitidas por essa modalidade."
              : "Em uma WABA comercial, o PedeAqui cria o template transacional e ativa o envio fora da janela assim que a Meta aprovar."}
        </p>
      </Card>
    </div>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return <article className={styles.supportCard}><strong>{title}</strong><span>{value}</span></article>;
}
