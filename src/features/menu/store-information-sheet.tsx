"use client";

import { useRef } from "react";
import type { PublicMenu } from "@/server/menu/schemas";
import styles from "./store-information-sheet.module.css";

type StoreInformation = Pick<
  PublicMenu["store"],
  | "name"
  | "phone"
  | "postal_code"
  | "street"
  | "number"
  | "complement"
  | "district"
  | "city"
  | "state"
  | "public_whatsapp"
  | "website_url"
  | "instagram_url"
  | "facebook_url"
  | "tiktok_url"
>;

type Props = {
  store: StoreInformation;
  hours: PublicMenu["hours"];
};

const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function phoneHref(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}

function whatsappHref(value: string | null) {
  if (!value) return null;
  const raw = digits(value);
  if (raw.length < 10) return null;
  const normalized = raw.startsWith("55") ? raw : raw.length <= 11 ? `55${raw}` : raw;
  return `https://wa.me/${normalized}`;
}

function addressLines(store: StoreInformation) {
  const street = [store.street, store.number].filter(Boolean).join(", ");
  const district = [store.complement, store.district].filter(Boolean).join(" · ");
  const city = [store.city, store.state].filter(Boolean).join(" - ");
  return [street, district, city, store.postal_code ? `CEP ${store.postal_code}` : null].filter(Boolean) as string[];
}

function mapsHref(store: StoreInformation) {
  const query = [store.street, store.number, store.district, store.city, store.state, store.postal_code].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function hoursByDay(hours: PublicMenu["hours"]) {
  return dayNames.map((day, weekday) => ({
    day,
    slots: hours
      .filter((hour) => hour.weekday === weekday)
      .map((hour) => `${hour.opens_at}–${hour.closes_at}${hour.closes_next_day ? " · dia seguinte" : ""}`),
  }));
}

export function StoreInformationSheet({ store, hours }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const address = addressLines(store);
  const directions = mapsHref(store);
  const call = phoneHref(store.phone);
  const whatsapp = whatsappHref(store.public_whatsapp);
  const schedule = hoursByDay(hours);
  const socialLinks = [
    { label: "Site", href: store.website_url },
    { label: "Instagram", href: store.instagram_url },
    { label: "Facebook", href: store.facebook_url },
    { label: "TikTok", href: store.tiktok_url },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href));
  const hasHours = hours.length > 0;
  const hasInformation = address.length > 0 || Boolean(store.phone) || Boolean(store.public_whatsapp) || hasHours || socialLinks.length > 0;

  if (!hasInformation) return null;

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return <>
    <button ref={triggerRef} type="button" className={styles.trigger} onClick={openDialog} aria-haspopup="dialog">
      <span aria-hidden>ⓘ</span> Informações da loja
    </button>

    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="store-information-title"
      onClose={() => triggerRef.current?.focus()}
      onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
    >
      <div className={styles.sheet}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>PedeAqui</span>
            <h2 id="store-information-title">Informações da loja</h2>
            <p>{store.name}</p>
          </div>
          <button type="button" className={styles.close} onClick={closeDialog} aria-label="Fechar informações da loja">×</button>
        </header>

        <div className={styles.content}>
          {address.length > 0 ? <section className={styles.section} aria-labelledby="store-address-title">
            <h3 id="store-address-title">Endereço</h3>
            <address className={styles.address}>{address.map((line) => <span key={line}>{line}</span>)}</address>
            {directions ? <a className={styles.action} href={directions} target="_blank" rel="noreferrer">Como chegar ↗</a> : null}
          </section> : null}

          {(store.phone || store.public_whatsapp) ? <section className={styles.section} aria-labelledby="store-contact-title">
            <h3 id="store-contact-title">Contato</h3>
            {store.phone ? <div className={styles.contactRow}><span><small>Telefone</small><strong>{store.phone}</strong></span>{call ? <a className={styles.action} href={call}>Ligar</a> : null}</div> : null}
            {store.public_whatsapp ? <div className={styles.contactRow}><span><small>WhatsApp</small><strong>{store.public_whatsapp}</strong></span>{whatsapp ? <a className={styles.action} href={whatsapp} target="_blank" rel="noreferrer">Falar com a loja ↗</a> : null}</div> : null}
          </section> : null}

          {hasHours ? <section className={styles.section} aria-labelledby="store-hours-title">
            <h3 id="store-hours-title">Horários</h3>
            <div className={styles.hours}>{schedule.map(({ day, slots }) => <div className={styles.hourRow} key={day}><span>{day}</span><strong>{slots.length > 0 ? slots.join(" / ") : "Fechado"}</strong></div>)}</div>
          </section> : null}

          {socialLinks.length > 0 ? <section className={styles.section} aria-labelledby="store-social-title">
            <h3 id="store-social-title">Redes sociais</h3>
            <div className={styles.links}>{socialLinks.map((item) => <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label} ↗</a>)}</div>
          </section> : null}
        </div>
      </div>
    </dialog>
  </>;
}
