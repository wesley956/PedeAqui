"use client";

import { useActionState } from "react";
import { createDriverMobileAccessAction, type DriverMobileAccessState } from "@/features/delivery/actions";
import styles from "@/features/delivery/delivery.module.css";

const initial: DriverMobileAccessState = {
  ok: false,
  error: null,
  email: null,
  inviteUrl: null,
  expiresAt: null,
  phone: null,
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

  if (driver.user_id) {
    return <div className={styles.feedback} data-tone="success">Acesso mobile já vinculado a este entregador.</div>;
  }

  const message = state.inviteUrl
    ? `Olá! Seu acesso de entregador ao PedeAqui está pronto. Abra o link, entre ou crie sua conta com o e-mail ${state.email} e aceite o convite: ${state.inviteUrl}`
    : "";
  const whatsapp = state.phone && message ? whatsappUrl(state.phone, message) : null;
  const mailto = state.email && message
    ? `mailto:${encodeURIComponent(state.email)}?subject=${encodeURIComponent("Acesso de entregador ao PedeAqui")}&body=${encodeURIComponent(message)}`
    : null;

  return <div className={styles.form}>
    <form action={action} className={styles.form}>
      <input type="hidden" name="driverId" value={driver.id} />
      <label className={styles.form}>
        <span className={styles.driverMeta}>ACESSO PELO CELULAR</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="E-mail que o entregador usará para entrar"
          className={styles.input}
        />
      </label>
      <button type="submit" disabled={pending} className={styles.secondaryButton}>
        {pending ? "Preparando acesso…" : "Liberar acesso mobile"}
      </button>
    </form>

    {state.error ? <div className={styles.feedback} data-tone="danger">{state.error}</div> : null}
    {state.inviteUrl ? <div className={styles.feedback} data-tone="success" style={{ display: "grid", gap: 10 }}>
      <strong>Acesso preparado para {driver.name}.</strong>
      <span>O link vale por 48 horas. O entregador deve usar o mesmo e-mail informado acima.</span>
      <input readOnly value={state.inviteUrl} className={styles.input} aria-label="Link de acesso do entregador" onFocus={(event) => event.currentTarget.select()} />
      <div className={styles.headerActions}>
        {whatsapp ? <a className={styles.secondaryButton} href={whatsapp} target="_blank" rel="noreferrer">Enviar no WhatsApp</a> : null}
        {mailto ? <a className={styles.secondaryButton} href={mailto}>Enviar por e-mail</a> : null}
        <button type="button" className={styles.secondaryButton} onClick={() => navigator.clipboard.writeText(state.inviteUrl ?? "")}>Copiar link</button>
      </div>
    </div> : null}
  </div>;
}
