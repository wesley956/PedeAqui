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
  secondaryButtonClassName?: string;
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

function searchable(value: string) {
  return normalize(value)
    .replace(/^(jardim|jd|parque|pq|vila|vl|residencial|res|condominio|cond|avenida|av)\s+/, "")
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
  secondaryButtonClassName,
}: Props) {
  const [selectedId, setSelectedId] = useState(defaultNeighborhoodId);
  const [query, setQuery] = useState("");
  const selected = neighborhoods.find((item) => item.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const needle = searchable(query);
    if (!needle) return [];
    const sorted = [...neighborhoods].sort((a, b) =>
      `${a.city} ${a.neighborhoodName}`.localeCompare(`${b.city} ${b.neighborhoodName}`, "pt-BR"),
    );
    return sorted
      .filter((item) => {
        const official = searchable(item.neighborhoodName);
        const full = searchable(`${item.neighborhoodName} ${item.city} ${item.state}`);
        return official.includes(needle) || full.includes(needle) || needle.includes(official);
      })
      .slice(0, 12);
  }, [neighborhoods, query]);

  function choose(id: string) {
    setSelectedId(id);
    setQuery("");
  }

  function changeNeighborhood() {
    setSelectedId("");
    setQuery("");
  }

  return (
    <div className={fieldClassName}>
      <span>Bairro</span>

      <input type="hidden" name="neighborhoodId" value={selected?.id ?? ""} />
      <input type="hidden" name="district" value={selected?.neighborhoodName ?? ""} />
      <input type="hidden" name="city" value={selected?.city ?? ""} />
      <input type="hidden" name="state" value={selected?.state ?? ""} />

      {selected ? (
        <div className={classes(choiceClassName, selectedClassName)}>
          <strong>✓ {selected.neighborhoodName}</strong>
          <span className={detailClassName}>Entrega {money(selected.feeCents)} · {selected.city}/{selected.state}</span>
          {selected.minimumOrderCents ? <span className={detailClassName}>Pedido mínimo {money(selected.minimumOrderCents)}</span> : null}
          <button type="button" className={secondaryButtonClassName} onClick={changeNeighborhood}>Trocar</button>
        </div>
      ) : (
        <>
          <input
            className={inputClassName}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite seu bairro"
            autoComplete="off"
            aria-label="Buscar bairro atendido"
            aria-controls="delivery-neighborhood-results"
          />

          {filtered.length > 0 ? (
            <div id="delivery-neighborhood-results" className={choicesClassName} role="listbox" aria-label="Bairros atendidos">
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
                  <span className={detailClassName}>Entrega {money(item.feeCents)} · {item.city}/{item.state}</span>
                  {item.minimumOrderCents ? <span className={detailClassName}>Pedido mínimo {money(item.minimumOrderCents)}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {query.trim() && filtered.length === 0 ? (
            <small>Ainda não entregamos nesse bairro. Tente outro endereço ou escolha retirada, se estiver disponível.</small>
          ) : (
            <small>Digite o nome do seu bairro para ver se a loja entrega aí.</small>
          )}
        </>
      )}
    </div>
  );
}
