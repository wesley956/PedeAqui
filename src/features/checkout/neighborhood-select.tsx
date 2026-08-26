"use client";

import { useMemo, useState } from "react";

type Neighborhood = {
  id: string;
  neighborhoodName: string;
  city: string;
  state: string;
  feeCents: number;
  minimumOrderCents: number | null;
};

type Props = {
  neighborhoods: Neighborhood[];
  defaultNeighborhoodId?: string;
  inputClassName?: string;
  fieldClassName?: string;
  choicesClassName?: string;
  choiceClassName?: string;
  selectedClassName?: string;
  detailClassName?: string;
};

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function NeighborhoodSelect({
  neighborhoods,
  defaultNeighborhoodId = "",
  inputClassName,
  fieldClassName,
  choicesClassName,
  choiceClassName,
  selectedClassName,
  detailClassName,
}: Props) {
  const [selectedId, setSelectedId] = useState(defaultNeighborhoodId);
  const [query, setQuery] = useState("");
  const selected = neighborhoods.find((item) => item.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = normalize(query);
    const sorted = [...neighborhoods].sort((a, b) =>
      `${a.city} ${a.neighborhoodName}`.localeCompare(`${b.city} ${b.neighborhoodName}`, "pt-BR"),
    );
    if (!needle) return selected ? [] : sorted.slice(0, 10);
    return sorted
      .filter((item) => normalize(`${item.neighborhoodName} ${item.city} ${item.state}`).includes(needle))
      .slice(0, 12);
  }, [neighborhoods, query, selected]);

  function choose(id: string) {
    setSelectedId(id);
    setQuery("");
  }

  return (
    <div className={fieldClassName}>
      <span>Bairro</span>
      <input
        className={inputClassName}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selectedId) setSelectedId("");
        }}
        placeholder={selected ? "Trocar bairro..." : "Digite para buscar seu bairro"}
        autoComplete="off"
        aria-label="Buscar bairro atendido"
      />

      <input type="hidden" name="neighborhoodId" value={selected?.id ?? ""} />
      <input type="hidden" name="district" value={selected?.neighborhoodName ?? ""} />
      <input type="hidden" name="city" value={selected?.city ?? ""} />
      <input type="hidden" name="state" value={selected?.state ?? ""} />

      {selected ? (
        <div className={classes(choiceClassName, selectedClassName)}>
          <strong>📍 {selected.neighborhoodName}</strong>
          <span className={detailClassName}>{selected.city}/{selected.state} · entrega {money(selected.feeCents)}</span>
          {selected.minimumOrderCents ? <span className={detailClassName}>Pedido mínimo: {money(selected.minimumOrderCents)}</span> : null}
        </div>
      ) : null}

      {!selected && filtered.length > 0 ? (
        <div className={choicesClassName} role="listbox" aria-label="Bairros atendidos">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={choiceClassName}
              onClick={() => choose(item.id)}
              role="option"
              aria-selected="false"
            >
              <strong>📍 {item.neighborhoodName}</strong>
              <span className={detailClassName}>{item.city}/{item.state} · entrega {money(item.feeCents)}</span>
              {item.minimumOrderCents ? <span className={detailClassName}>Pedido mínimo: {money(item.minimumOrderCents)}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {!selected && query.trim() && filtered.length === 0 ? (
        <small>Esse bairro não está na lista de entrega desta loja.</small>
      ) : null}
      {!selected ? <small>Selecione um bairro da lista para continuar.</small> : null}
    </div>
  );
}
