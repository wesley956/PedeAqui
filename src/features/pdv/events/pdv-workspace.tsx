"use client";
import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";
import { PosShell } from "@/features/pdv/pos-shell";
import styles from "@/features/pdv/pdv.module.css";
const EventsPanel = dynamic(() => import("./events-panel").then(module => module.EventsPanel), { loading: () => <p role="status">Carregando eventos…</p> });
export function PdvWorkspace(props: ComponentProps<typeof PosShell>) {
  const [tab, setTab] = useState<"sale" | "events">("sale");
  const [opened, setOpened] = useState(false);
  return <div className={styles.workspace}>
    <nav className={styles.eventTabs} aria-label="Área do PDV">
      <button type="button" className={tab === "sale" ? styles.categoryActive : styles.categoryButton} aria-pressed={tab === "sale"} onClick={() => setTab("sale")}>Venda</button>
      <button type="button" className={tab === "events" ? styles.categoryActive : styles.categoryButton} aria-pressed={tab === "events"} onClick={() => { setOpened(true); setTab("events"); }}>Eventos</button>
    </nav>
    <div className={styles.workspaceBody} hidden={tab !== "sale"}><PosShell {...props} /></div>
    {opened ? <div className={styles.workspaceBody} hidden={tab !== "events"}><EventsPanel {...props} /></div> : null}
  </div>;
}
