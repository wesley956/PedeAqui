import { markCustomerPanelMessageReadAction } from "@/features/customer-messages/actions";
import type { CustomerPanelMessage } from "@/server/platform/customer-panel-message-service";
import styles from "./customer-messages.module.css";

const KIND_LABEL: Record<string, string> = {
  announcement: "Aviso",
  billing: "Cobrança",
  support: "Suporte",
  product: "Produto",
  onboarding: "Onboarding",
  other: "Mensagem",
};

export function CustomerMessageBanner({ messages }: { messages: readonly CustomerPanelMessage[] }) {
  const message = messages.find((item) => !item.readAt);
  if (!message) return null;

  return (
    <section className={styles.banner} data-kind={message.kind} aria-label="Mensagem importante do PedeAqui">
      <div className={styles.bannerContent}>
        <div className={styles.bannerHeading}>
          <span className={styles.kind}>{KIND_LABEL[message.kind] ?? "Mensagem"}</span>
          <strong>{message.title}</strong>
        </div>
        <p>{message.body}</p>
      </div>
      <form action={markCustomerPanelMessageReadAction}>
        <input type="hidden" name="messageId" value={message.id} />
        <button className={styles.action} type="submit">Entendi</button>
      </form>
    </section>
  );
}
