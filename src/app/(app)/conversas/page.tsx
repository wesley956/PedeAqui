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
import { getAccessContext } from "@/server/access/context";
import { ConversationService } from "@/server/conversations/conversation-service";
import { conversationStatusLabel, type ConversationStatus } from "@/server/conversations/model";

function when(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
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

  const selectedRow = params.conversation
    ? inbox.conversations.find((row) => row.id === params.conversation)
    : inbox.conversations[0];
  const detail = selectedRow ? await ConversationService.loadConversation(selectedRow.id) : null;
  const clientMessageId = detail ? ConversationService.newClientMessageId() : null;

  const filters = [
    ["all", "Todas"],
    ["waiting_agent", "Fila humana"],
    ["human", "Em atendimento"],
    ["bot", "Bot"],
    ["closed", "Encerradas"],
  ] as const;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <ConversationRealtime storeId={context.storeId} />
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Atendimento omnichannel</p>
          <h1 style={{ margin: "4px 0" }}>Conversas</h1>
          <p className="muted" style={{ margin: 0 }}>Inbox, bot e atendimento humano usando o mesmo contato do CRM.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={inbox.integration.enabled ? "success" : "neutral"}>WhatsApp {inbox.integration.enabled ? "habilitado" : inbox.integration.configured ? "configurado" : "não configurado"}</Badge>
          <Badge tone={inbox.integration.aiEnabled ? "success" : "neutral"}>IA {inbox.integration.aiEnabled ? "habilitada" : "desligada"}</Badge>
        </div>
      </header>

      {params.erro === "send_failed" ? (
        <Card role="alert" style={{ borderColor: "var(--danger)" }}>
          <strong>Não foi possível enviar a mensagem.</strong>
          <p className="muted" style={{ marginBottom: 0 }}>Confira a configuração do provider/credenciais e tente novamente. A tentativa ficou registrada no histórico.</p>
        </Card>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge>{inbox.counts.total} na visão</Badge>
        <Badge tone={inbox.counts.waiting > 0 ? "danger" : "neutral"}>{inbox.counts.waiting} aguardando</Badge>
        <Badge tone="success">{inbox.counts.human} humanas</Badge>
        <Badge>{inbox.counts.bot} bot</Badge>
        <Badge>{inbox.counts.unread} não lidas</Badge>
      </div>

      <nav aria-label="Filtros da inbox" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {filters.map(([value, label]) => (
          <Link key={value} href={filterHref(value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", textDecoration: "none", fontWeight: 700, background: inbox.filter === value ? "var(--surface-2)" : "transparent" }}>
            {label}
          </Link>
        ))}
      </nav>

      {inbox.conversations.length === 0 ? (
        <EmptyState title="Nenhuma conversa nesta fila" description="Novas mensagens aparecerão aqui automaticamente quando um canal estiver conectado." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 360px) minmax(0, 1fr)", gap: 12, alignItems: "start" }} className="conversations-layout">
          <div style={{ display: "grid", gap: 8, maxHeight: "calc(100vh - 270px)", overflowY: "auto" }}>
            {inbox.conversations.map((conversation) => {
              const active = detail?.conversation.id === conversation.id;
              return (
                <Link key={conversation.id} href={filterHref(inbox.filter, conversation.id)} style={{ textDecoration: "none" }}>
                  <Card style={{ borderColor: active ? "var(--accent)" : "var(--border)", display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{conversation.contactName}</strong>
                      {Number(conversation.unread_count) > 0 ? <Badge tone="danger">{conversation.unread_count}</Badge> : null}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Badge tone={statusTone(conversation.status)}>{conversationStatusLabel(conversation.status as ConversationStatus)}</Badge>
                      <Badge>{conversation.channel}</Badge>
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>{conversation.preview}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{when(conversation.last_message_at ?? conversation.opened_at)}</span>
                  </Card>
                </Link>
              );
            })}
          </div>

          {detail ? (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{detail.contact?.name ?? detail.contact?.phone_normalized ?? "Contato"}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{detail.contact?.phone_normalized ?? detail.contact?.external_id ?? "Sem telefone"}</div>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge tone={statusTone(detail.conversation.status)}>{conversationStatusLabel(detail.conversation.status as ConversationStatus)}</Badge>
                  {detail.contact?.customer_id ? <Link href={`/clientes/${detail.contact.customer_id}`}>Abrir cliente</Link> : null}
                </div>
              </div>

              <div style={{ padding: 16, minHeight: 320, maxHeight: "52vh", overflowY: "auto", display: "grid", gap: 10, alignContent: "start", background: "var(--surface-2)" }}>
                {detail.messages.length === 0 ? <span className="muted">Sem mensagens ainda.</span> : detail.messages.map((message) => {
                  const outbound = message.direction === "outbound";
                  return (
                    <div key={message.id} style={{ justifySelf: outbound ? "end" : "start", maxWidth: "82%", display: "grid", gap: 4 }}>
                      <div style={{ padding: "10px 12px", borderRadius: outbound ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: outbound ? "var(--accent)" : "var(--surface)", border: "1px solid var(--border)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {message.body || `[${message.content_type}]`}
                      </div>
                      <span className="muted" style={{ fontSize: 10, textAlign: outbound ? "right" : "left" }}>
                        {when(message.created_at)} · {outbound ? message.delivery_status : "recebida"}
                        {message.error_message ? ` · ${message.error_message}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {detail.conversation.status !== "human" ? (
                    <form action={assumeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button type="submit">Assumir</Button></form>
                  ) : null}
                  {detail.conversation.status !== "waiting_agent" && detail.conversation.status !== "closed" ? (
                    <form action={queueConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Enviar para fila</Button></form>
                  ) : null}
                  {detail.conversation.status !== "bot" && detail.conversation.status !== "closed" ? (
                    <form action={returnConversationToBotAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Devolver ao bot</Button></form>
                  ) : null}
                  {Number(detail.conversation.unread_count) > 0 ? (
                    <form action={markConversationReadAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="secondary" type="submit">Marcar lida</Button></form>
                  ) : null}
                  {detail.conversation.status !== "closed" ? (
                    <form action={closeConversationAction}><input type="hidden" name="conversationId" value={detail.conversation.id} /><Button tone="danger" type="submit">Encerrar</Button></form>
                  ) : null}
                </div>

                {detail.conversation.status === "human" && detail.conversation.assigned_user_id === detail.currentUserId && clientMessageId ? (
                  <form action={sendConversationMessageAction} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                    <input type="hidden" name="conversationId" value={detail.conversation.id} />
                    <input type="hidden" name="clientMessageId" value={clientMessageId} />
                    <textarea name="body" required maxLength={16000} rows={2} placeholder="Escreva uma mensagem…" aria-label="Mensagem" style={{ resize: "vertical", minHeight: 48, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: 10 }} />
                    <Button type="submit" style={{ alignSelf: "stretch" }}>Enviar</Button>
                  </form>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                    {detail.conversation.status === "closed" ? "Conversa encerrada." : "Assuma a conversa para responder como atendente. Enquanto estiver em atendimento humano, o bot não responde."}
                  </p>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </section>
  );
}
