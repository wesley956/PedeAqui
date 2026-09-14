import { markCustomerPanelMessageReadAction } from "@/features/customer-messages/actions";
import type { CustomerPanelMessageState } from "@/server/platform/customer-panel-message-service";
import styles from "./customer-messages.module.css";

const KIND_LABEL: Record<string, string> = {
  announcement: "Aviso",
  billing: "Cobrança",
  support: "Suporte",
  product: "Produto",
  onboarding: "Onboarding",
  other: "Mensagem",
};

const DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function CustomerMessageNotifications({ state }: { state: CustomerPanelMessageState }) {
  return (
    <details className={styles.notifications}>
      <summary aria-label={`Notificações${state.unreadCount ? `, ${state.unreadCount} não lida(s)` : ""}`}>
        <span aria-hidden>🔔</span>
        <span className={styles.notificationLabel}>Avisos</span>
        {state.unreadCount > 0 ? <span className={styles.badge}>{state.unreadCount}</span> : null}
      </summary>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <strong>Notificações</strong>
          <span>{state.unreadCount} não lida(s)</span>
        </div>
        {state.messages.map((message) => (
          <article className={styles.message} data-unread={!message.readAt} key={message.id}>
            <div className={styles.messageHeader}>
              <div className={styles.messageTitle}>
                <small>{KIND_LABEL[message.kind] ?? "Mensagem"}</small>
                <strong>{message.title}</strong>
              </div>
              {!message.readAt ? <span className={styles.badge}>Nova</span> : null}
            </div>
            <p>{message.body}</p>
            <div className={styles.messageFooter}>
              <time className={styles.date} dateTime={message.sentAt}>{DATE.format(new Date(message.sentAt))}</time>
              {message.readAt ? <span className={styles.readLabel}>Lida</span> : (
                <form action={markCustomerPanelMessageReadAction}>
                  <input type="hidden" name="messageId" value={message.id} />
                  <button className={styles.action} type="submit">Marcar como lida</button>
                </form>
              )}
            </div>
          </article>
        ))}
        {state.messages.length === 0 ? <p className={styles.empty}>Nenhuma notificação por enquanto.</p> : null}
      </div>
    </details>
  );
}
