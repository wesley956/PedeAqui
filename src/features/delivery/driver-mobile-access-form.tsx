"use client";

import { useActionState } from "react";
import { createDriverMobileAccessAction, type DriverMobileAccessState } from "@/features/delivery/actions";
import styles from "@/features/delivery/delivery.module.css";

const initial: DriverMobileAccessState = {
  ok: false,
  error: null,
  inviteUrl: null,
  expiresAt: null,
  phone: null,
  linked: false,
};

function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function DriverMobileAccessForm({ driver }: {
  driver: { id: string; name: string; phone: string | null; user_id: string | null };
}) {
  const [state, action, pending] = useActionState(createDriverMobileAccessAction, initial);
  const message = state.inviteUrl
    ? `Olá, ${driver.name}! Seu acesso de entregador ao PedeAqui está pronto. Abra este link no celular, confirme o telefone e crie seu PIN de 6 números: ${state.inviteUrl}`
    : "";
  const whatsapp = state.phone && message ? whatsappUrl(state.phone, message) : null;

  return <div className={styles.form}>
    <div className={styles.driverMeta}>ACESSO PELO CELULAR</div>
    <div className={styles.driverMeta}>
      {driver.user_id
        ? "Acesso já vinculado. Gere um novo link somente para redefinir o PIN ou preparar outro celular."
        : driver.phone
          ? `O primeiro acesso será liberado para o telefone cadastrado: ${driver.phone}.`
          : "Cadastre um telefone para este entregador antes de liberar o acesso."}
    </div>

    <form action={action} className={styles.form}>
      <input type="hidden" name="driverId" value={driver.id} />
      <button type="submit" disabled={pending || !driver.phone} className={styles.secondaryButton}>
        {pending ? "Preparando acesso…" : driver.user_id ? "Gerar novo link / redefinir PIN" : "Liberar acesso"}
      </button>
    </form>

    {state.error ? <div className={styles.feedback} data-tone="danger">{state.error}</div> : null}
    {state.inviteUrl ? <div className={styles.feedback} data-tone="success" style={{ display: "grid", gap: 10 }}>
      <strong>{state.linked ? "Novo acesso preparado." : "Primeiro acesso preparado."}</strong>
      <span>O link vale por 48 horas e pode ser enviado diretamente pelo WhatsApp. O entregador só precisará criar um PIN de 6 números.</span>
      <input readOnly value={state.inviteUrl} className={styles.input} aria-label="Link de acesso do entregador" onFocus={(event) => event.currentTarget.select()} />
      <div className={styles.headerActions}>
        {whatsapp ? <a className={styles.secondaryButton} href={whatsapp} target="_blank" rel="noreferrer">Enviar no WhatsApp</a> : null}
        <button type="button" className={styles.secondaryButton} onClick={() => navigator.clipboard.writeText(state.inviteUrl ?? "")}>Copiar link</button>
      </div>
    </div> : null}
  </div>;
}
