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

function avatarInitial(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  for (const character of Array.from(normalized)) {
    if (/^[\p{L}\p{N}]$/u.test(character)) return character.toUpperCase();
  }
  return "C";
}

function deliveryLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    pending: "enviando",
    sent: "enviada",
    delivered: "entregue",
    read: "lida",
    failed: "falhou",
    received: "recebida",
  };
  return labels[status ?? ""] ?? "enviada";
}

function statusLabel(status: ConversationStatus) {
  return status === "bot" ? "Robô" : conversationStatusLabel(status);
}

function inboxHref({
  status = "all",
  conversation,
  q,
  view,
}: {
  status?: string;
  conversation?: string;
  q?: string;
  view?: string;
}) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (conversation) params.set("conversation", conversation);
  if (q) params.set("q", q);
  if (view === "unread") params.set("view", "unread");
  const query = params.toString();
  return query ? `/conversas?${query}` : "/conversas";
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; conversation?: string; erro?: string; q?: string; view?: string }>;
}) {
  const params = await searchParams;
  const inbox = await ConversationService.loadInbox(params.status);
  const context = await getAccessContext();
  if (!context.storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;
  const search = (params.q ?? "").trim().slice(0, 80);
  const unreadOnly = params.view === "unread";

  const visibleConversations = inbox.conversations.filter((conversation) => {
    if (unreadOnly && Number(conversation.unread_count) <= 0) return false;
    if (!search) return true;
    const haystack = `${conversation.contactName} ${conversation.phone ?? ""} ${conversation.preview}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(search.toLocaleLowerCase("pt-BR"));
  });

  const selectedRow = params.conversation
    ? visibleConversations.find((row) => row.id === params.conversation)
    : undefined;
  const detail = selectedRow ? await InboxIntelligenceService.load(selectedRow.id) : null;
  const clientMessageId = detail ? ConversationService.newClientMessageId() : null;
  const latestHistory = detail ? detail.history.slice(-1).reverse() : [];
  const unreadConversations = inbox.conversations.filter((row) => Number(row.unread_count) > 0).length;

  const filters = [
    ["all", "Todas"],
    ["waiting_agent", "Aguardando"],
    ["human", "Humano"],
    ["bot", "Robô"],
    ["closed", "Encerradas"],
  ] as const;

  const isAssignedToCurrentUser = detail?.conversation.assigned_user_id === detail?.currentUserId;
  const ownershipLabel = !detail
    ? null
    : detail.conversation.status === "human"
      ? isAssignedToCurrentUser
        ? "Atendimento com você"
        : detail.conversation.assigned_user_id
          ? "Atendimento com outro usuário"
          : "Atendimento humano sem responsável identificado"
      : statusLabel(detail.conversation.status as ConversationStatus);

  return (
    <section className={`${styles.page} conversations-workspace-route`}>
      <ConversationRealtime storeId={context.storeId} />

      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Conversas</h1>
          <span>Atendimento WhatsApp</span>
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
                  <span>{inbox.counts.total} conversas · {unreadConversations} com não lidas</span>
                </div>
                {inbox.counts.unread > 0 ? <span className={styles.unreadSummary}>{inbox.counts.unread} mensagens não lidas</span> : <Badge>Em dia</Badge>}
              </div>

              <form className={styles.searchForm} action="/conversas" method="get">
                {inbox.filter !== "all" ? <input type="hidden" name="status" value={inbox.filter} /> : null}
                {unreadOnly ? <input type="hidden" name="view" value="unread" /> : null}
                <input className={styles.searchInput} name="q" defaultValue={search} placeholder="Buscar nome ou telefone" aria-label="Buscar conversas" />
                <Button type="submit" tone="secondary">Buscar</Button>
                {search ? <Link className={styles.clearSearch} href={inboxHref({ status: inbox.filter, view: unreadOnly ? "unread" : undefined })}>Limpar</Link> : null}
              </form>

              <nav aria-label="Filtros das conversas" className={styles.filters}>
                {filters.map(([value, label]) => <Link key={value} href={inboxHref({ status: value, q: search })} className={styles.filter} data-active={!unreadOnly && inbox.filter === value || undefined}>{label}</Link>)}
                <Link href={inboxHref({ q: search, view: "unread" })} className={styles.filter} data-active={unreadOnly || undefined}>Não lidas</Link>
              </nav>
            </div>

            <div className={styles.inboxList}>
              {visibleConversations.length === 0 ? <div className={styles.listEmpty}>Nenhuma conversa corresponde aos filtros atuais.</div> : visibleConversations.map((conversation) => {
                const active = detail?.conversation.id === conversation.id;
                return <Link key={conversation.id} href={inboxHref({ status: inbox.filter, conversation: conversation.id, q: search, view: unreadOnly ? "unread" : undefined })} className={styles.conversationLink} aria-current={active ? "page" : undefined}>
                  <article className={styles.conversationCard} data-active={active || undefined}>
                    <div className={styles.conversationAvatar} aria-hidden="true">{avatarInitial(conversation.contactName)}</div>
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
                        <Badge tone={statusTone(conversation.status)}>{statusLabel(conversation.status as ConversationStatus)}</Badge>
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
                <Link href={inboxHref({ status: inbox.filter, q: search, view: unreadOnly ? "unread" : undefined })} className={styles.mobileBack} aria-label="Voltar para conversas">←</Link>
                <div className={styles.threadAvatar} aria-hidden="true">{avatarInitial(detail.contact?.name ?? detail.contact?.phone_normalized)}</div>
                <div>
                  <strong>{detail.contact?.name ?? detail.contact?.phone_normalized ?? "Contato"}</strong>
                  <div className={styles.contactMeta}>{ownershipLabel}</div>
                </div>
              </div>
              <div className={styles.threadHeaderActions}>
                <Badge tone={statusTone(detail.conversation.status)}>{statusLabel(detail.conversation.status as ConversationStatus)}</Badge>
              </div>
            </div>

            <div className={styles.messages} aria-label="Histórico da conversa">
              {detail.messages.length === 0 ? <span className="muted">Sem mensagens ainda.</span> : detail.messages.map((message) => {
                const outbound = message.direction === "outbound";
                return <div key={message.id} className={styles.message} data-direction={outbound ? "outbound" : "inbound"}>
                  <span className={styles.authorTag} data-author={authorKey(message.authorLabel)}>{message.authorLabel}</span>
                  <div className={styles.bubble}>{message.body || `[${message.content_type}]`}</div>
                  <span className={styles.messageMeta}>{when(message.created_at, timeZone)} · {outbound ? deliveryLabel(message.delivery_status) : "recebida"}{message.error_message ? ` · ${message.error_message}` : ""}</span>
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

              {detail.conversation.status === "human" && isAssignedToCurrentUser && clientMessageId ? <form action={sendConversationMessageAction} className={styles.sendForm}>
                <input type="hidden" name="conversationId" value={detail.conversation.id} />
                <input type="hidden" name="clientMessageId" value={clientMessageId} />
                <textarea name="body" required maxLength={16000} rows={1} placeholder="Digite uma mensagem" aria-label="Mensagem" className={styles.textarea} />
                <Button type="submit">Enviar</Button>
              </form> : <p className={styles.replyHint}>{detail.conversation.status === "closed" ? "Conversa encerrada." : detail.conversation.status === "human" && !isAssignedToCurrentUser ? "Esta conversa está com outro usuário. O campo de resposta fica bloqueado para evitar duas pessoas respondendo ao mesmo tempo." : detail.conversation.status === "waiting_agent" ? "O robô está pausado. Assuma a conversa para responder; o retorno ao robô é manual." : "Assuma a conversa para responder como atendente. Enquanto o humano estiver ativo, o robô não responde."}</p>}
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
                <div className={styles.contextAvatar} aria-hidden="true">{avatarInitial(detail.contact?.name ?? detail.contact?.phone_normalized)}</div>
                <div>
                  <strong>{detail.contact?.name ?? "Contato WhatsApp"}</strong>
                  <span>{detail.contact?.phone_normalized ?? detail.contact?.external_id ?? "Telefone não disponível"}</span>
                </div>
              </div>
              {detail.subject.customerId ? <Link className={styles.contextAction} href={`/clientes/${detail.subject.customerId}`}>Abrir cadastro do cliente →</Link> : <p className={styles.contextMuted}>Contato ainda não vinculado ao cadastro de cliente.</p>}
            </section>

            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>ATENDIMENTO</p>
              <dl className={styles.contextList}>
                <div><dt>Estado</dt><dd>{statusLabel(detail.conversation.status as ConversationStatus)}</dd></div>
                <div><dt>Responsável</dt><dd>{detail.conversation.status === "human" ? isAssignedToCurrentUser ? "Você" : detail.conversation.assigned_user_id ? "Outro usuário" : "Não identificado" : "—"}</dd></div>
                <div><dt>Canal</dt><dd>{detail.conversation.channel === "whatsapp" ? "WhatsApp" : detail.conversation.channel}</dd></div>
                <div><dt>Mensagens não lidas</dt><dd>{Number(detail.conversation.unread_count)}</dd></div>
                <div><dt>Retorno ao robô</dt><dd>Manual</dd></div>
              </dl>
            </section>

            {latestHistory.length > 0 ? <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>ÚLTIMA MUDANÇA</p>
              <ol className={styles.historyList}>
                {latestHistory.map((entry) => <li key={entry.id}><strong>{statusLabel(entry.to_state as ConversationStatus)}</strong><span>{when(entry.created_at, timeZone)}</span></li>)}
              </ol>
            </section> : null}
          </aside> : null}
        </div>
      )}
    </section>
  );
}
