"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { applyModuleChangeInlineAction, type ModuleInlineActionState } from "@/features/modules/actions";
import styles from "./resources.module.css";

export type ResourceItem = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  core: boolean;
  canActivate: boolean;
  availabilityLabel: string | null;
  dependencies: string[];
};

const initialState: ModuleInlineActionState = { status: "idle" };

export function ResourcesClient({ resources, focusKey = null }: { resources: readonly ResourceItem[]; focusKey?: string | null }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const visible = useMemo(() => resources.filter((resource) => {
    const matchesQuery = !normalized || `${resource.label} ${resource.description}`.toLocaleLowerCase("pt-BR").includes(normalized);
    const matchesFilter = filter === "all" || (filter === "active" ? resource.enabled : !resource.enabled);
    return matchesQuery && matchesFilter;
  }), [resources, normalized, filter]);

  useEffect(() => {
    if (!focusKey) return;
    const element = document.getElementById(`resource-${focusKey}`);
    if (!element) return;
    requestAnimationFrame(() => element.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focusKey]);

  return <>
    <div className={styles.controls}>
      <label className={styles.search}><span aria-hidden>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar recurso..." /></label>
      <div className={styles.filters} aria-label="Filtrar recursos">
        <button type="button" data-active={filter === "all" || undefined} onClick={() => setFilter("all")}>Todos</button>
        <button type="button" data-active={filter === "active" || undefined} onClick={() => setFilter("active")}>Ativos</button>
        <button type="button" data-active={filter === "inactive" || undefined} onClick={() => setFilter("inactive")}>Inativos</button>
      </div>
    </div>

    <div className={styles.list}>
      {visible.map((resource) => <ResourceRow resource={resource} key={`${resource.key}:${resource.enabled}`} highlighted={resource.key === focusKey} />)}
    </div>
    {visible.length === 0 ? <div className={styles.empty}>Nenhum recurso encontrado com esse filtro.</div> : null}
  </>;
}

function ResourceRow({ resource, highlighted }: { resource: ResourceItem; highlighted: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(applyModuleChangeInlineAction, initialState);
  const targetEnabled = !resource.enabled;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state.status, router]);

  return <article id={`resource-${resource.key}`} className={styles.resource} data-highlighted={highlighted || undefined}>
    <div className={styles.resourceMain}>
      <div className={styles.copy}><div className={styles.titleLine}><strong>{resource.label}</strong>{resource.core ? <span className={styles.locked}>Sempre ativo</span> : resource.enabled ? <span className={styles.active}>Ativo</span> : <span className={styles.inactive}>Inativo</span>}</div><p>{resource.description}</p>{resource.dependencies.length > 0 ? <small>Usa também: {resource.dependencies.join(", ")}</small> : null}</div>
      {!resource.core ? <form action={action} className={styles.actionForm}>
        <input type="hidden" name="moduleKey" value={resource.key} />
        <input type="hidden" name="enabled" value={String(targetEnabled)} />
        {!resource.enabled && !resource.canActivate ? <span className={styles.unavailable}>{resource.availabilityLabel ?? "Indisponível"}</span> : <button type="submit" className={resource.enabled ? styles.secondaryButton : styles.primaryButton} disabled={pending}>{pending ? (targetEnabled ? "Ativando…" : "Desativando…") : state.status === "confirm" ? "Confirmar" : resource.enabled ? "Desativar" : "Ativar"}</button>}
      </form> : null}
    </div>
    {state.status === "confirm" ? <div className={styles.confirm} role="status"><span>{state.message}</span><small>Toque em Confirmar para aplicar. Você permanece nesta mesma posição da página.</small></div> : null}
    {state.status === "error" ? <div className={styles.error} role="alert">{state.message}</div> : null}
    {state.status === "success" ? <div className={styles.success} role="status">{state.message}</div> : null}
  </article>;
}
