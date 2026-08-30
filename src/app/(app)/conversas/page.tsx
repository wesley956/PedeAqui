import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { ConversationRealtime } from "@/features/conversations/conversation-realtime";
import {
  assumeConversationAction,
  closeConversationAction,
  markConversationReadAction,
  queueConversationAction,
  returnConversationToBotAction,
  sendConversationMessageAction,
} from "@/features/conversations/actions";
import { DEFAULT_STORE_TIMEZONE, formatStoreDateTime } from "@/lib/store-date-time";
import { getAccessContext } from "@/server/access/context";
import { ConversationService } from "@/server/conversations/conversation-service";
import { conversationStatusLabel, type ConversationStatus } from "@/server/conversations/model";
import styles from "./conversations.module.css";

function when(value: string | null | undefined, timeZone: string) {
  return formatStoreDateTime(value, timeZone);
}

function statusTone(status: string) {
  if (status === "human") return "success" as const;
  if (status === "waiting_agent") return "danger" as const;
  return "neutral" as const;
}

function filterHref(status: string, conversation?: string) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (conversation) params.set("conversation", conversation);
  const query = params.toString();
  return query ? `/conversas?${query}` : "/conversas";
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; conversation?: string; erro?: string }>;
}) {
  const params = await searchParams;
  const inbox = await ConversationService.loadInbox(params.status);
  const context = await getAccessContext();
  if (!context.storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;

  const selectedRow = params.conversation
    ? inbox.conversations.find((row) => row.id === params.conversation)
    : inbox.conversations[0];
  const detail = selectedRow ? await ConversationService.loadConversation(selectedRow.id) : null;
  const clientMessageId = detail ? ConversationService.newClientMessageId() : null;

  const filters = [
    ["all", "Todas"],
    ["waiting_agent", "Aguardando atendimento"],
    ["human", "Em atendimento"],
    ["bot", "Automático"],
    ["closed", "Encerradas"],
  ] as const;

  return (
    <section className={styles.page}>
      <ConversationRealtime storeId={context.storeId} />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ATENDIMENTO</p>
          <h1>Conversas</h1>
          <p>Veja quem está aguardando, assuma o atendimento quando necessário e converse com o cliente em um só lugar.</p>
        </div>
        <div className={styles.integrationStatus}>
          <Badge tone={inbox.integration.enabled ? "success" : "neutral"}>WhatsApp {inbox.integration.enabled ? "ativo" : inbox.integration.configured ? "configurado" : "não configurado"}</Badge>
          <Badge tone={inbox.integration.aiEnabled ? "success" : "neutral"}>Atendimento automático {inbox.integration.aiEnabled ? "ativo" : "desligado"}</Badge>
        </div>
      </header>

      {params.erro === "send_failed" ? <div className={styles.alert} role="alert"><strong>Não foi possível enviar a mensagem.</strong><p>Confira a conexão do WhatsApp e tente novamente. A tentativa ficou registrada no histórico.</p></div> : null}

      <div className={styles.metrics}>
        <Badge>{inbox.counts.total} na visão</Badge>
        <Badge tone={inbox.counts.waiting > 0 ? "danger" : "neutral"}>{inbox.counts.waiting} aguardando</Badge>
        <Badge tone="success">{inbox.counts.human} em atendimento</Badge>
        <Badge>{inbox.counts.bot} automáticas</Badge>
        <Badge>{inbox.counts.unread} não lidas</Badge>
      </div>

      <nav aria-label="Filtros das conversas" className={styles.filters}>
        {filters.map(([value, label]) => <Link key={value} href={filterHref(value)} className={styles.filter} data-active={inbox.filter === value || undefined}>{label}</Link>)}
      </nav>

      {inbox.conversations.length === 0 ? <div className={styles.empty}><EmptyState title="Nenhuma conversa nesta fila" description="Novas mensagens aparecerão aqui automaticamente quando um canal estiver conectado." /></div> : (
        <div className={styles.layout}>
          <div className={styles.inbox}>
            {inbox.conversations.map((conversation) => {
              const active = detail?.conversation.id === conversation.id;
              return <Link key={conversation.id} href={filterHref(inbox.filter, conversation.id)} className={styles.conversationLink}>
                <article className={styles.conversationCard} data-active={active || undefined}>
                  <div className={styles.conversationTop}><strong>{conversation.contactName}</strong>{Number(conversation.unread_count) > 0 ? <Badge tone="danger">{conversation.unread_count}</Badge> : null}</div>
                  <div className={styles.badges}><Badge tone={statusTone(conversation.status)}>{conversationStatusLabel(conversation.status as ConversationStatus)}</Badge><Badge>{conversation.channel}</Badge></div>
                  <span className={styles.preview}>{conversation.preview}</span>
                  <span className={styles.time}>{when(conversation.last_message_at ?? conversation.opened_at, timeZone)}</span>
                </article>
              </Link>;
            })}
          </div>

          {detail ? <Card className={styles.thread}>
            <div className={styles.threadHeader}>
              <div><strong>{detail.contact?.name ?? detail.contact?.phone_normalized ?? "Contato"}</strong><div className={styles.contactMeta}>{detail.contact?.phone_normalized ?? detail.contact?.external_id ?? "Sem telefone"}</div></div>
              <div className={styles.threadHeaderActions}><Badge tone={statusTone(detail.conversation.status)}>{conversationStatusLabel(detail.conversation.status as ConversationStatus)}</Badge>{detail.contact?.customer_id ? <Link href={`/clientes/${detail.contact.customer_id}`}>Abrir cliente</Link> : null}</div>
            </div>

            <div className={styles.messages}>
              {detail.messages.length === 0 ? <span className="muted">Sem mensagens ainda.</span> : detail.messages.map((message) => {
                const outbound = message.direction === "outbound";
                return <div key={message.id} className={styles.message} data-direction={outbound ? "outbound" : "inbound"}>
                  <div className={styles.bubble}>{message.body || `[${message.content_type}]`}</div>
                  <span className={styles.messageMeta}>{when(message.created_at, timeZone)} · {outbound ? message.delivery_status : "recebida"}{message.error_message ? ` · ${message.error_message}` : ""}</span>
                </div>;
              })}
            </div>

            <div className={styles.composer}>
              <div className={styles.actions}>
                {detail.conversation.status !== "human" ? <form action={assumeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button type="submit">Assumir atendimento</Button></form> : null}
                {detail.conversation.status !== "waiting_agent" && detail.conversation.status !== "closed" ? <form action={queueConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Colocar na fila</Button></form> : null}
                {detail.conversation.status !== "bot" && detail.conversation.status !== "closed" ? <form action={returnConversationToBotAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Voltar ao automático</Button></form> : null}
                {Number(detail.conversation.unread_count) > 0 ? <form action={markConversationReadAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Marcar como lida</Button></form> : null}
                {detail.conversation.status !== "closed" ? <form action={closeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="danger" type="submit">Encerrar</Button></form> : null}
              </div>

              {detail.conversation.status === "human" && detail.conversation.assigned_user_id === detail.currentUserId && clientMessageId ? <form action={sendConversationMessageAction} className={styles.sendForm}>
                <input type="hidden" name="conversationId" value={detail.conversation.id} />
                <input type="hidden" name="clientMessageId" value={clientMessageId} />
                <textarea name="body" required maxLength={16000} rows={2} placeholder="Escreva uma mensagem…" aria-label="Mensagem" className={styles.textarea} />
                <Button type="submit">Enviar</Button>
              </form> : <p className={styles.replyHint}>{detail.conversation.status === "closed" ? "Conversa encerrada." : "Assuma a conversa para responder como atendente. Enquanto o atendimento humano estiver ativo, o automático não responde."}</p>}
            </div>
          </Card> : null}
        </div>
      )}
    </section>
  );
}
