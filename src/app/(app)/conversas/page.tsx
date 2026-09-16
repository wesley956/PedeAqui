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
import { InboxIntelligenceService } from "@/server/conversations/inbox-intelligence-service";
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

function authorKey(label: string) {
  if (label === "Cliente") return "customer";
  if (label === "Robô") return "bot";
  if (label === "Atendente PedeAqui") return "agent";
  if (label === "WhatsApp Business") return "business";
  return "system";
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
    : undefined;
  const detail = selectedRow ? await InboxIntelligenceService.load(selectedRow.id) : null;
  const clientMessageId = detail ? ConversationService.newClientMessageId() : null;
  const recentHistory = detail ? detail.history.slice(-3).reverse() : [];

  const filters = [
    ["all", "Todas"],
    ["waiting_agent", "Aguardando"],
    ["human", "Humano"],
    ["bot", "Robô"],
    ["closed", "Encerradas"],
  ] as const;

  return (
    <section className={styles.page}>
      <ConversationRealtime storeId={context.storeId} />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ATENDIMENTO</p>
          <h1>Conversas</h1>
          <p>Atenda pelo PedeAqui sem perder o histórico do robô ou do WhatsApp Business.</p>
        </div>
        <div className={styles.integrationStatus} aria-label="Estado do atendimento">
          <Badge tone={inbox.integration.enabled ? "success" : "neutral"}>WhatsApp {inbox.integration.enabled ? "ativo" : inbox.integration.configured ? "configurado" : "não configurado"}</Badge>
          <Badge tone={inbox.integration.aiEnabled ? "success" : "neutral"}>Robô {inbox.integration.aiEnabled ? "ativo" : "desligado"}</Badge>
        </div>
      </header>

      {params.erro === "send_failed" ? <div className={styles.alert} role="alert"><strong>Não foi possível enviar a mensagem.</strong><p>Confira a conexão do WhatsApp e tente novamente. A tentativa ficou registrada no histórico.</p></div> : null}

      {inbox.conversations.length === 0 ? <div className={styles.empty}><EmptyState title="Nenhuma conversa nesta fila" description="Novas mensagens aparecerão aqui automaticamente quando um canal estiver conectado." /></div> : (
        <div className={styles.workspace} data-selected={detail ? "true" : undefined}>
          <aside className={styles.inboxPanel} aria-label="Lista de conversas">
            <div className={styles.inboxToolbar}>
              <div className={styles.inboxTitleRow}>
                <div>
                  <strong>Caixa de entrada</strong>
                  <span>{inbox.counts.total} nesta visão</span>
                </div>
                {inbox.counts.unread > 0 ? <Badge tone="danger">{inbox.counts.unread} não lidas</Badge> : <Badge>Em dia</Badge>}
              </div>

              <div className={styles.metrics} aria-label="Resumo das conversas">
                <span><strong>{inbox.counts.waiting}</strong> aguardando</span>
                <span><strong>{inbox.counts.human}</strong> humano</span>
                <span><strong>{inbox.counts.bot}</strong> robô</span>
              </div>

              <nav aria-label="Filtros das conversas" className={styles.filters}>
                {filters.map(([value, label]) => <Link key={value} href={filterHref(value)} className={styles.filter} data-active={inbox.filter === value || undefined}>{label}</Link>)}
              </nav>
            </div>

            <div className={styles.inboxList}>
              {inbox.conversations.map((conversation) => {
                const active = detail?.conversation.id === conversation.id;
                return <Link key={conversation.id} href={filterHref(inbox.filter, conversation.id)} className={styles.conversationLink} aria-current={active ? "page" : undefined}>
                  <article className={styles.conversationCard} data-active={active || undefined}>
                    <div className={styles.conversationAvatar} aria-hidden="true">{conversation.contactName.slice(0, 1).toUpperCase()}</div>
                    <div className={styles.conversationBody}>
                      <div className={styles.conversationTop}>
                        <strong>{conversation.contactName}</strong>
                        <span className={styles.time}>{when(conversation.last_message_at ?? conversation.opened_at, timeZone)}</span>
                      </div>
                      <div className={styles.previewRow}>
                        <span className={styles.preview}>{conversation.preview}</span>
                        {Number(conversation.unread_count) > 0 ? <span className={styles.unreadBadge}>{conversation.unread_count}</span> : null}
                      </div>
                      <div className={styles.badges}>
                        <Badge tone={statusTone(conversation.status)}>{conversationStatusLabel(conversation.status as ConversationStatus)}</Badge>
                        {conversation.latestDirection === "inbound" ? <span className={styles.lastDirection}>Cliente respondeu</span> : null}
                      </div>
                    </div>
                  </article>
                </Link>;
              })}
            </div>
          </aside>

          {detail ? <Card className={styles.thread}>
            <div className={styles.threadHeader}>
              <div className={styles.threadIdentity}>
                <Link href={filterHref(inbox.filter)} className={styles.mobileBack} aria-label="Voltar para conversas">←</Link>
                <div className={styles.threadAvatar} aria-hidden="true">{(detail.contact?.name ?? detail.contact?.phone_normalized ?? "C").slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{detail.contact?.name ?? detail.contact?.phone_normalized ?? "Contato"}</strong>
                  <div className={styles.contactMeta}>{detail.contact?.phone_normalized ?? detail.contact?.external_id ?? "Sem telefone"}</div>
                </div>
              </div>
              <div className={styles.threadHeaderActions}>
                <Badge tone={statusTone(detail.conversation.status)}>{conversationStatusLabel(detail.conversation.status as ConversationStatus)}</Badge>
                {detail.contact?.customer_id ? <Link className={styles.headerLink} href={`/clientes/${detail.contact.customer_id}`}>Cliente</Link> : null}
              </div>
            </div>

            <div className={styles.messages} aria-label="Histórico da conversa">
              {detail.messages.length === 0 ? <span className="muted">Sem mensagens ainda.</span> : detail.messages.map((message) => {
                const outbound = message.direction === "outbound";
                return <div key={message.id} className={styles.message} data-direction={outbound ? "outbound" : "inbound"}>
                  <span className={styles.authorTag} data-author={authorKey(message.authorLabel)}>{message.authorLabel}</span>
                  <div className={styles.bubble}>{message.body || `[${message.content_type}]`}</div>
                  <span className={styles.messageMeta}>{when(message.created_at, timeZone)} · {outbound ? message.delivery_status ?? "enviando" : "recebida"}{message.error_message ? ` · ${message.error_message}` : ""}</span>
                </div>;
              })}
            </div>

            <div className={styles.composer}>
              <div className={styles.actions}>
                {detail.conversation.status !== "human" ? <form action={assumeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button type="submit">Assumir atendimento</Button></form> : null}
                {detail.conversation.status !== "waiting_agent" && detail.conversation.status !== "closed" ? <form action={queueConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Colocar na fila</Button></form> : null}
                {detail.conversation.status !== "bot" && detail.conversation.status !== "closed" ? <form action={returnConversationToBotAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Voltar ao robô</Button></form> : null}
                {Number(detail.conversation.unread_count) > 0 ? <form action={markConversationReadAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Marcar como lida</Button></form> : null}
                {detail.conversation.status !== "closed" ? <form action={closeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="danger" type="submit">Encerrar</Button></form> : null}
              </div>

              {detail.conversation.status === "human" && detail.conversation.assigned_user_id === detail.currentUserId && clientMessageId ? <form action={sendConversationMessageAction} className={styles.sendForm}>
                <input type="hidden" name="conversationId" value={detail.conversation.id} />
                <input type="hidden" name="clientMessageId" value={clientMessageId} />
                <textarea name="body" required maxLength={16000} rows={2} placeholder="Digite uma mensagem" aria-label="Mensagem" className={styles.textarea} />
                <Button type="submit">Enviar</Button>
              </form> : <p className={styles.replyHint}>{detail.conversation.status === "closed" ? "Conversa encerrada." : detail.conversation.status === "waiting_agent" ? "O robô está pausado. Assuma a conversa para responder; o retorno ao robô é manual." : "Assuma a conversa para responder como atendente. Enquanto o humano estiver ativo, o robô não responde."}</p>}
            </div>
          </Card> : <div className={styles.threadPlaceholder}>
            <div className={styles.placeholderIcon} aria-hidden="true">💬</div>
            <strong>Selecione uma conversa</strong>
            <p>Abra um contato da caixa de entrada para ver o histórico e iniciar o atendimento.</p>
          </div>}

          {detail ? <aside className={styles.contextPanel} aria-label="Contexto do atendimento">
            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>CLIENTE</p>
              <div className={styles.contextPerson}>
                <div className={styles.contextAvatar} aria-hidden="true">{(detail.contact?.name ?? detail.contact?.phone_normalized ?? "C").slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{detail.contact?.name ?? "Contato WhatsApp"}</strong>
                  <span>{detail.contact?.phone_normalized ?? detail.contact?.external_id ?? "Telefone não disponível"}</span>
                </div>
              </div>
              {detail.subject.customerId ? <Link className={styles.contextAction} href={`/clientes/${detail.subject.customerId}`}>Abrir cadastro do cliente →</Link> : <p className={styles.contextMuted}>Este contato ainda não está vinculado a um cadastro de cliente.</p>}
            </section>

            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>ATENDIMENTO</p>
              <dl className={styles.contextList}>
                <div><dt>Estado</dt><dd>{conversationStatusLabel(detail.conversation.status as ConversationStatus)}</dd></div>
                <div><dt>Canal</dt><dd>{detail.conversation.channel === "whatsapp" ? "WhatsApp" : detail.conversation.channel}</dd></div>
                <div><dt>Não lidas</dt><dd>{Number(detail.conversation.unread_count)}</dd></div>
                <div><dt>Retorno ao robô</dt><dd>Manual</dd></div>
              </dl>
            </section>

            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>PEDIDO</p>
              {detail.intelligenceContext.activeReferences.orderId ? <p className={styles.contextMuted}>Existe um pedido ativo vinculado ao contexto desta conversa.</p> : <p className={styles.contextMuted}>Nenhum pedido ativo está projetado para esta conversa agora.</p>}
            </section>

            {recentHistory.length > 0 ? <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>ÚLTIMAS MUDANÇAS</p>
              <ol className={styles.historyList}>
                {recentHistory.map((entry) => <li key={entry.id}><strong>{conversationStatusLabel(entry.to_state as ConversationStatus)}</strong><span>{when(entry.created_at, timeZone)}</span></li>)}
              </ol>
            </section> : null}
          </aside> : null}
        </div>
      )}
    </section>
  );
}
