import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { ConversationRealtime } from "@/features/conversations/conversation-realtime";
import {
  assumeConversationAction,
  closeConversationAction,
  queueConversationAction,
  returnConversationToBotAction,
  sendConversationMediaAction,
  sendConversationMessageAction,
  sendConversationTemplateAction,
} from "@/features/conversations/actions";
import { DEFAULT_STORE_TIMEZONE, formatStoreDateTime } from "@/lib/store-date-time";
import { getAccessContext } from "@/server/access/context";
import { formatCents } from "@/server/catalog/money";
import { ConversationService } from "@/server/conversations/conversation-service";
import { InboxContextService } from "@/server/conversations/inbox-context-service";
import { InboxIntelligenceService } from "@/server/conversations/inbox-intelligence-service";
import { conversationStatusLabel, type ConversationStatus } from "@/server/conversations/model";
import { ConversationTimeline } from "./conversation-timeline";
import styles from "./conversations.module.css";

const orderStatusLabels: Record<string, string> = {
  pending_confirmation: "Aguardando confirmação",
  confirmed: "Confirmado",
  rejected: "Recusado",
  canceled: "Cancelado",
  completed: "Concluído",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "Pagamento pendente",
  paid: "Pago",
  failed: "Falha no pagamento",
  refunded: "Reembolsado",
  canceled: "Pagamento cancelado",
};

function when(value: string | null | undefined, timeZone: string) {
  return formatStoreDateTime(value, timeZone);
}

function statusTone(status: string) {
  if (status === "human") return "success" as const;
  if (status === "waiting_agent") return "danger" as const;
  return "neutral" as const;
}

function avatarInitial(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  for (const character of Array.from(normalized)) {
    if (/^[\p{L}\p{N}]$/u.test(character)) return character.toUpperCase();
  }
  return "C";
}

function statusLabel(status: ConversationStatus) {
  return status === "bot" ? "Robô" : conversationStatusLabel(status);
}

function orderStatusLabel(status: string) {
  return orderStatusLabels[status] ?? status.replaceAll("_", " ");
}

function paymentStatusLabel(status: string) {
  return paymentStatusLabels[status] ?? status.replaceAll("_", " ");
}

function fulfillmentLabel(value: string) {
  if (value === "delivery") return "Entrega";
  if (value === "pickup") return "Retirada";
  if (value === "dine_in") return "Salão";
  return value.replaceAll("_", " ");
}

function inboxHref({
  status = "all",
  conversation,
  q,
  cursor,
}: {
  status?: string;
  conversation?: string;
  q?: string;
  cursor?: string;
}) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (conversation) params.set("conversation", conversation);
  if (q) params.set("q", q);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/conversas?${query}` : "/conversas";
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; conversation?: string; erro?: string; q?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 80);
  const inbox = await ConversationService.loadInbox({
    filter: params.status,
    search,
    cursor: params.cursor,
  });
  const context = await getAccessContext();
  if (!context.storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;

  const selectedRow = params.conversation
    ? inbox.conversations.find((row) => row.id === params.conversation)
    : undefined;
  const detail = params.conversation ? await InboxIntelligenceService.load(params.conversation) : null;
  const detailContext = detail ? await InboxContextService.load(detail.conversation.id) : null;
  const clientMessageId = detail ? ConversationService.newClientMessageId() : null;
  const latestHistory = detail ? detail.history.slice(-1).reverse() : [];
  void selectedRow;

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
      {params.erro === "media_failed" ? <div className={styles.alert} role="alert"><strong>Não foi possível enviar o anexo.</strong><p>Use JPEG, PNG, WebP, áudio, MP4, PDF ou documento Office com até 4 MB. A tentativa não aparece como enviada.</p></div> : null}
      {params.erro === "window_closed" || params.erro === "window_unknown" ? <div className={styles.alert} role="alert"><strong>A janela de atendimento da Meta não permite mensagem livre.</strong><p>Use um template aprovado abaixo. Uma nova mensagem do cliente reabre a janela de atendimento.</p></div> : null}
      {params.erro === "connection_unavailable" ? <div className={styles.alert} role="alert"><strong>WhatsApp indisponível para envio.</strong><p>A conexão da unidade precisa estar conectada antes de responder.</p></div> : null}
      {params.erro === "template_unavailable" || params.erro === "template_invalid" || params.erro === "template_failed" ? <div className={styles.alert} role="alert"><strong>Não foi possível enviar o template.</strong><p>Atualize a conversa e confirme se o modelo continua aprovado e disponível na conta da Meta.</p></div> : null}
      {params.erro === "provider_retryable" ? <div className={styles.alert} role="alert"><strong>A Meta está temporariamente indisponível.</strong><p>Nenhuma tentativa foi apresentada como sucesso. Tente novamente quando o canal estabilizar.</p></div> : null}
      {params.erro === "provider_non_retryable" ? <div className={styles.alert} role="alert"><strong>A Meta rejeitou o envio.</strong><p>Revise a conexão ou o template aprovado antes de tentar novamente.</p></div> : null}

      {inbox.conversations.length === 0 && !params.cursor ? <div className={styles.empty}><EmptyState title="Nenhuma conversa nesta fila" description="Novas mensagens aparecerão aqui automaticamente quando um canal estiver conectado." /></div> : (
        <div className={styles.workspace} data-selected={detail ? "true" : undefined}>
          <aside className={styles.inboxPanel} aria-label="Lista de conversas">
            <div className={styles.inboxToolbar}>
              <div className={styles.inboxTitleRow}>
                <div>
                  <strong>Caixa de entrada</strong>
                  <span>{inbox.counts.total} conversas</span>
                </div>
              </div>

              <form className={styles.searchForm} action="/conversas" method="get">
                {inbox.filter !== "all" ? <input type="hidden" name="status" value={inbox.filter} /> : null}
                <input className={styles.searchInput} name="q" defaultValue={search} placeholder="Buscar nome ou telefone" aria-label="Buscar conversas" />
                <Button type="submit" tone="secondary">Buscar</Button>
                {search ? <Link className={styles.clearSearch} href={inboxHref({ status: inbox.filter })}>Limpar</Link> : null}
              </form>

              <nav aria-label="Filtros das conversas" className={styles.filters}>
                {filters.map(([value, label]) => <Link key={value} href={inboxHref({ status: value, q: search })} className={styles.filter} data-active={inbox.filter === value || undefined}>{label}</Link>)}
              </nav>
            </div>

            <div className={styles.inboxList}>
              {inbox.conversations.length === 0 ? <div className={styles.listEmpty}>Nenhuma conversa corresponde a esta página. Volte ao início da lista.</div> : inbox.conversations.map((conversation) => {
                const active = detail?.conversation.id === conversation.id;
                return <Link key={conversation.id} href={inboxHref({ status: inbox.filter, conversation: conversation.id, q: search, cursor: params.cursor })} className={styles.conversationLink} aria-current={active ? "page" : undefined}>
                  <article className={styles.conversationCard} data-active={active || undefined}>
                    <div className={styles.conversationAvatar} aria-hidden="true">{avatarInitial(conversation.contactName)}</div>
                    <div className={styles.conversationBody}>
                      <div className={styles.conversationTop}>
                        <strong>{conversation.contactName}</strong>
                        <span className={styles.time}>{when(conversation.last_message_at ?? conversation.opened_at, timeZone)}</span>
                      </div>
                      <div className={styles.previewRow}>
                        <span className={styles.preview}>{conversation.preview}</span>
                      </div>
                      <div className={styles.badges}>
                        <Badge tone={statusTone(conversation.status)}>{statusLabel(conversation.status as ConversationStatus)}</Badge>
                        {conversation.humanAttentionRequestedAt ? <Badge tone="danger">Cliente pediu atendimento</Badge> : null}
                        {conversation.latestDirection === "inbound" ? <span className={styles.lastDirection}>Cliente respondeu</span> : null}
                      </div>
                    </div>
                  </article>
                </Link>;
              })}

              <div className={styles.filters} aria-label="Paginação das conversas">
                {params.cursor ? <Link className={styles.filter} href={inboxHref({ status: inbox.filter, q: search })}>Voltar ao início</Link> : null}
                {inbox.pageInfo.hasMore && inbox.pageInfo.nextCursor ? <Link className={styles.filter} href={inboxHref({ status: inbox.filter, q: search, cursor: inbox.pageInfo.nextCursor })}>Mais conversas</Link> : null}
              </div>
            </div>
          </aside>

          {detail ? <Card className={styles.thread}>
            <div className={styles.threadHeader}>
              <div className={styles.threadIdentity}>
                <Link href={inboxHref({ status: inbox.filter, q: search, cursor: params.cursor })} className={styles.mobileBack} aria-label="Voltar para conversas">←</Link>
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

            <ConversationTimeline
              conversationId={detail.conversation.id}
              storeId={context.storeId}
              timeZone={timeZone}
              initialMessages={detail.messages.map((message) => ({ ...message, authorLabel: message.authorLabel }))}
              initialPreviousCursor={detail.messagePagination.previousCursor}
              initialLatestCursor={detail.messagePagination.latestCursor}
              initialHasOlder={detail.messagePagination.hasOlder}
            />

            <div className={styles.composer}>
              <div className={styles.actions}>
                {detail.conversation.status !== "human" ? <form action={assumeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button type="submit">Assumir atendimento</Button></form> : null}
                {detail.conversation.status !== "waiting_agent" && detail.conversation.status !== "closed" ? <form action={queueConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Colocar na fila</Button></form> : null}
                {detail.conversation.status !== "bot" && detail.conversation.status !== "closed" ? <form action={returnConversationToBotAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Voltar ao robô</Button></form> : null}
                {detail.conversation.status !== "closed" ? <form action={closeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="danger" type="submit">Encerrar</Button></form> : null}
              </div>

              {detail.conversation.status === "human" && isAssignedToCurrentUser ? <div className={styles.sendStatus} data-open={detail.sendCapability.canSendFreeform || undefined}>
                <strong>{detail.sendCapability.canSendFreeform ? "Janela Meta aberta" : "Template necessário"}</strong>
                <span>{detail.sendCapability.canSendFreeform
                  ? detail.sendCapability.expiresAt ? `Mensagem livre disponível até ${when(detail.sendCapability.expiresAt, timeZone)}.` : "Mensagem livre disponível."
                  : detail.sendCapability.connectionStatus !== "connected"
                    ? "A conexão do WhatsApp não está pronta para envio."
                    : detail.sendCapability.windowStatus === "unknown"
                      ? "Ainda não há um inbound elegível para abrir a janela de atendimento."
                      : "A janela de 24 horas terminou; mensagens livres e anexos ficam bloqueados."}</span>
              </div> : null}

              {detail.conversation.status === "human" && isAssignedToCurrentUser && clientMessageId && detail.sendCapability.canSendFreeform ? <form action={sendConversationMessageAction} className={styles.sendForm}>
                <input type="hidden" name="conversationId" value={detail.conversation.id} />
                <input type="hidden" name="clientMessageId" value={clientMessageId} />
                <textarea name="body" required maxLength={16000} rows={1} placeholder="Digite uma mensagem" aria-label="Mensagem" className={styles.textarea} />
                <Button type="submit">Enviar</Button>
              </form> : <p className={styles.replyHint}>{detail.conversation.status === "closed" ? "Conversa encerrada." : detail.conversation.status === "human" && !isAssignedToCurrentUser ? "Esta conversa está com outro usuário. O campo de resposta fica bloqueado para evitar duas pessoas respondendo ao mesmo tempo." : detail.conversation.status === "human" && isAssignedToCurrentUser && !detail.sendCapability.canSendFreeform ? "Mensagem livre bloqueada pela política da Meta. Use um template aprovado quando disponível." : detail.conversation.status === "waiting_agent" ? "O robô está pausado. Assuma a conversa para responder; o retorno ao robô é manual." : "Assuma a conversa para responder como atendente. Enquanto o humano estiver ativo, o robô não responde."}</p>}
              {detail.conversation.status === "human" && isAssignedToCurrentUser && clientMessageId && detail.sendCapability.canSendMedia ? <form action={sendConversationMediaAction} className={styles.attachmentForm}>
                <input type="hidden" name="conversationId" value={detail.conversation.id} />
                <input type="hidden" name="clientMessageId" value={`media:${clientMessageId}`} />
                <input className={styles.fileInput} type="file" name="file" required accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/amr,audio/wav,video/mp4,application/pdf,.docx,.xlsx,.pptx" aria-label="Escolher anexo" />
                <input className={styles.searchInput} type="text" name="caption" maxLength={1024} placeholder="Legenda opcional" aria-label="Legenda do anexo" />
                <Button tone="secondary" type="submit">Enviar anexo</Button>
                <p className={styles.attachmentHint}>Arquivos permitidos até 4 MB. Downloads ficam privados e exigem acesso à unidade.</p>
              </form> : null}
              {detail.conversation.status === "human" && isAssignedToCurrentUser && clientMessageId && !detail.sendCapability.canSendFreeform && detail.sendCapability.canSendTemplate && detail.sendCapability.templates.length > 0 ? <form action={sendConversationTemplateAction} className={styles.templateForm}>
                <input type="hidden" name="conversationId" value={detail.conversation.id} />
                <input type="hidden" name="clientMessageId" value={`template:${clientMessageId}`} />
                <label>
                  <span>Template aprovado</span>
                  <select name="templateKey" required className={styles.templateSelect}>
                    {detail.sendCapability.templates.map((template) => <option key={`${template.name}:${template.language}`} value={`${template.name}::${template.language}`}>
                      {template.name} · {template.language}{template.bodyParameterCount > 0 ? ` · ${template.bodyParameterCount} parâmetro(s)` : ""}
                    </option>)}
                  </select>
                </label>
                <label>
                  <span>Parâmetros do corpo</span>
                  <textarea className={styles.templateParams} name="parameters" rows={2} maxLength={6000} placeholder="Um parâmetro por linha, somente se o template exigir" />
                </label>
                <Button type="submit">Enviar template</Button>
                <p className={styles.attachmentHint}>O servidor confirma novamente aprovação, WABA, idioma e quantidade de parâmetros antes do envio.</p>
              </form> : null}
              {detail.conversation.status === "human" && isAssignedToCurrentUser && !detail.sendCapability.canSendFreeform && detail.sendCapability.canSendTemplate && !detail.sendCapability.templateCatalogAvailable ? <p className={styles.replyHint}>Não foi possível consultar os templates aprovados agora. Nenhuma mensagem livre será enviada como fallback.</p> : null}
              {detail.conversation.status === "human" && isAssignedToCurrentUser && !detail.sendCapability.canSendFreeform && detail.sendCapability.canSendTemplate && detail.sendCapability.templateCatalogAvailable && detail.sendCapability.templates.length === 0 ? <p className={styles.replyHint}>Não há template aprovado compatível disponível para resposta manual nesta conta.</p> : null}
            </div>
          </Card> : <div className={styles.threadPlaceholder}>
            <div className={styles.placeholderIcon} aria-hidden="true">💬</div>
            <strong>Selecione uma conversa</strong>
            <p>Abra um contato da caixa de entrada para ver o histórico e iniciar o atendimento.</p>
          </div>}

          {detail && detailContext ? <aside className={styles.contextPanel} aria-label="Contexto do atendimento">
            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>CLIENTE</p>
              <div className={styles.contextPerson}>
                <div className={styles.contextAvatar} aria-hidden="true">{avatarInitial(detailContext.customer?.name ?? detailContext.contact.name ?? detailContext.contact.phone)}</div>
                <div>
                  <strong>{detailContext.customer?.name ?? detailContext.contact.name ?? "Contato WhatsApp"}</strong>
                  <span>{detailContext.customer?.phone ?? detailContext.contact.phone ?? "Telefone não disponível"}</span>
                </div>
              </div>

              {!detailContext.linkedCustomerId ? <p className={styles.contextMuted}>Contato ainda não vinculado ao cadastro de cliente.</p> : detailContext.permissions.customer === "restricted" ? <p className={styles.contextRestricted}>Seu perfil não possui acesso aos dados do cliente e endereços.</p> : detailContext.customer ? <>
                <div className={styles.contextMetrics}>
                  <div><span>Pedidos</span><strong>{detailContext.customer.ordersCount}</strong></div>
                  <div><span>Total</span><strong>{formatCents(detailContext.customer.totalSpentCents)}</strong></div>
                  <div><span>Última compra</span><strong>{detailContext.customer.lastOrderAt ? when(detailContext.customer.lastOrderAt, timeZone) : "—"}</strong></div>
                </div>
                <Link className={styles.contextAction} href={`/clientes/${detailContext.linkedCustomerId}`}>Abrir cadastro do cliente →</Link>
              </> : <p className={styles.contextMuted}>O vínculo existe, mas o cadastro do cliente não está disponível.</p>}
            </section>

            {detailContext.linkedCustomerId ? <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>ENDEREÇOS</p>
              {detailContext.permissions.customer === "restricted" ? <p className={styles.contextRestricted}>Endereços ocultos pela sua permissão atual.</p> : detailContext.addresses.length === 0 ? <p className={styles.contextMuted}>Nenhum endereço cadastrado para este cliente.</p> : <div className={styles.contextAddressList}>
                {detailContext.addresses.slice(0, 3).map((address) => <article key={address.id} className={styles.contextAddressCard}>
                  <div className={styles.contextCardTitle}><strong>{address.label}</strong>{address.isDefault ? <span>Principal</span> : null}</div>
                  <p>{address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ""}</p>
                  <p>{address.district} · {address.city}/{address.state}{address.postalCode ? ` · CEP ${address.postalCode}` : ""}</p>
                  {address.reference ? <small>Ref.: {address.reference}</small> : null}
                </article>)}
                {detailContext.addresses.length > 3 ? <p className={styles.contextMuted}>+ {detailContext.addresses.length - 3} endereço(s) no cadastro do cliente.</p> : null}
              </div>}
            </section> : null}

            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>PEDIDO</p>
              {detailContext.permissions.orders === "restricted" ? <p className={styles.contextRestricted}>Seu perfil não possui acesso aos pedidos desta unidade.</p> : <>
                {detailContext.whatsappDraft ? <article className={`${styles.contextOrderCard} ${styles.contextDraftCard}`}>
                  <div className={styles.contextCardTitle}><strong>Em montagem no WhatsApp</strong><span>Rascunho ativo</span></div>
                  {detailContext.whatsappDraft.items.length > 0 ? <ul className={styles.contextItemList}>
                    {detailContext.whatsappDraft.items.map((item) => <li key={item.id}><span>{item.quantity}x {item.name}</span><strong>{formatCents(item.lineTotalCents)}</strong></li>)}
                  </ul> : <p className={styles.contextMuted}>Carrinho iniciado, ainda sem itens visíveis.</p>}
                  <div className={styles.contextOrderTotal}><span>Total atual</span><strong>{formatCents(detailContext.whatsappDraft.totalCents)}</strong></div>
                  <p className={styles.contextMuted}>A montagem continua no fluxo canônico do WhatsApp; esta tela não altera o carrinho.</p>
                </article> : null}

                {detailContext.currentOrder ? <article className={styles.contextOrderCard}>
                  <div className={styles.contextOrderTop}>
                    <div><strong>Pedido #{detailContext.currentOrder.displayNumber}</strong><span>{orderStatusLabel(detailContext.currentOrder.orderStatus)}</span></div>
                    <strong>{formatCents(detailContext.currentOrder.totalCents)}</strong>
                  </div>
                  <div className={styles.contextPills}><span>{paymentStatusLabel(detailContext.currentOrder.paymentStatus)}</span><span>{fulfillmentLabel(detailContext.currentOrder.fulfillmentType)}</span></div>
                  {detailContext.currentOrderItems.length > 0 ? <ul className={styles.contextItemList}>
                    {detailContext.currentOrderItems.map((item) => <li key={item.id}><span>{item.quantity}x {item.name}</span><strong>{formatCents(item.lineTotalCents)}</strong></li>)}
                  </ul> : null}
                  <Link className={styles.contextAction} href={`/pedidos/${detailContext.currentOrder.id}`}>Abrir pedido →</Link>
                </article> : !detailContext.whatsappDraft ? <p className={styles.contextMuted}>Nenhum pedido ativo nesta unidade.</p> : null}
              </>}
            </section>

            {detailContext.permissions.orders === "available" && detailContext.orderHistory.length > 0 ? <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>HISTÓRICO DE PEDIDOS</p>
              <ol className={styles.contextOrderHistory}>
                {detailContext.orderHistory.map((order) => <li key={order.id}>
                  <div><strong>#{order.displayNumber} · {orderStatusLabel(order.orderStatus)}</strong><span>{when(order.createdAt, timeZone)} · {formatCents(order.totalCents)}</span></div>
                  <Link className={styles.contextAction} href={`/pedidos/${order.id}`}>Abrir →</Link>
                </li>)}
              </ol>
            </section> : null}

            <section className={styles.contextSection}>
              <p className={styles.contextEyebrow}>ATENDIMENTO</p>
              <dl className={styles.contextList}>
                <div><dt>Estado</dt><dd>{statusLabel(detail.conversation.status as ConversationStatus)}</dd></div>
                <div><dt>Responsável</dt><dd>{detail.conversation.status === "human" ? isAssignedToCurrentUser ? "Você" : detail.conversation.assigned_user_id ? "Outro usuário" : "Não identificado" : "—"}</dd></div>
                <div><dt>Canal</dt><dd>{detail.conversation.channel === "whatsapp" ? "WhatsApp" : detail.conversation.channel}</dd></div>
                <div><dt>Atenção humana</dt><dd>{detail.conversation.human_attention_requested_at ? "Solicitada pelo cliente" : "Não solicitada"}</dd></div>
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
