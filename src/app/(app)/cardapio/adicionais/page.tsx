import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { ModifierService } from "@/server/catalog/modifier-service";
import {
  createModifierFormAction,
  createModifierGroupFormAction,
  removeModifierAction,
  removeModifierGroupAction,
  updateModifierFormAction,
  updateModifierGroupFormAction,
} from "@/features/catalog/actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { formatCents } from "@/server/catalog/money";

const selectStyle = {
  width: "100%",
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
} as const;

function editableMoney(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function SelectionModeField({ id, defaultValue = "distinct_choices" }: { id: string; defaultValue?: string }) {
  return <label style={{ display: "grid", gap: 6 }} htmlFor={id}>
    <span style={{ fontWeight: 700, fontSize: 14 }}>Como o cliente escolhe</span>
    <select id={id} name="selectionMode" defaultValue={defaultValue} style={selectStyle}>
      <option value="distinct_choices">Escolha simples ou múltipla</option>
      <option value="quantity_per_option">Quantidade por opção (− / +)</option>
    </select>
    <span className="muted" style={{ fontSize: 12 }}>Use quantidade por opção para sabores em que o cliente informa quantas unidades quer de cada um.</span>
  </label>;
}

export default async function ModifiersPage() {
  const [groups, modifiers] = await Promise.all([
    ModifierService.listGroups(),
    ModifierService.listModifiers(),
  ]);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Adicionais, tamanhos e sabores</h1>
        <p className="muted">Crie escolhas tradicionais ou grupos por quantidade, como sabores de um copo com limite total.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <ResilientMutationForm action={createModifierGroupFormAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo grupo</h2>
          <Input id="new-group-name" label="Nome" name="name" required />
          <Input id="new-group-description" label="Descrição" name="description" />
          <SelectionModeField id="new-group-selection-mode" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input id="new-group-min" label="Mínimo total" name="minSelection" type="number" min={0} defaultValue={0} />
            <Input id="new-group-max" label="Máximo total" name="maxSelection" type="number" min={1} defaultValue={1} />
          </div>
          <Input id="new-group-order" label="Ordem" name="sortOrder" type="number" min={0} defaultValue={0} />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="required" type="checkbox" /> Obrigatório</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="active" type="checkbox" defaultChecked /> Ativo</label>
          <Button type="submit">Criar grupo</Button>
        </ResilientMutationForm>

        <ResilientMutationForm action={createModifierFormAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo adicional ou opção</h2>
          <label style={{ display: "grid", gap: 6 }} htmlFor="new-modifier-group">
            <span style={{ fontWeight: 700, fontSize: 14 }}>Grupo</span>
            <select id="new-modifier-group" name="modifierGroupId" required disabled={groups.length === 0} style={selectStyle}>
              {groups.length === 0 ? <option value="">Crie um grupo primeiro</option> : groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <Input id="new-modifier-name" label="Nome" name="name" required />
          <Input id="new-modifier-price" label="Preço adicional por unidade" name="price" inputMode="decimal" defaultValue="0,00" required />
          <Input id="new-modifier-order" label="Ordem" name="sortOrder" type="number" min={0} defaultValue={0} />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="active" type="checkbox" defaultChecked /> Ativo</label>
          <Button type="submit" disabled={groups.length === 0}>Criar opção</Button>
        </ResilientMutationForm>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {groups.length === 0 ? <article className="card" style={{ padding: 18 }}><span className="muted">Nenhum grupo cadastrado.</span></article> : null}
        {groups.map((group) => {
          const items = modifiers.filter((modifier) => modifier.modifier_group_id === group.id);
          const quantityMode = group.selection_mode === "quantity_per_option";
          return (
            <article key={group.id} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{group.name}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {group.required ? "Obrigatório" : "Opcional"} · {quantityMode ? `${group.min_selection}–${group.max_selection} unidades no total` : `${group.min_selection}–${group.max_selection} seleção(ões)`} · ordem {group.sort_order}
                  </div>
                  {quantityMode ? <div className="muted" style={{ fontSize: 12 }}>O máximo é um teto. O cliente pode continuar antes dele assim que o mínimo estiver atendido.</div> : null}
                </div>
                <span className="muted">{group.active ? "Ativo" : "Inativo"}</span>
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Editar grupo</summary>
                <ResilientMutationForm action={updateModifierGroupFormAction} successReset={false} style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  <input type="hidden" name="modifierGroupId" value={group.id} />
                  <Input id={`group-${group.id}-name`} label="Nome" name="name" required defaultValue={group.name} />
                  <Input id={`group-${group.id}-description`} label="Descrição" name="description" defaultValue={group.description ?? ""} />
                  <SelectionModeField id={`group-${group.id}-selection-mode`} defaultValue={group.selection_mode ?? "distinct_choices"} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Input id={`group-${group.id}-min`} label="Mínimo total" name="minSelection" type="number" min={0} defaultValue={group.min_selection} />
                    <Input id={`group-${group.id}-max`} label="Máximo total" name="maxSelection" type="number" min={1} defaultValue={group.max_selection} />
                  </div>
                  <Input id={`group-${group.id}-order`} label="Ordem" name="sortOrder" type="number" min={0} defaultValue={group.sort_order} />
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="required" type="checkbox" defaultChecked={group.required} /> Obrigatório</label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="active" type="checkbox" defaultChecked={group.active} /> Ativo</label>
                  <Button type="submit">Salvar grupo</Button>
                </ResilientMutationForm>
              </details>

              <ResilientMutationForm action={removeModifierGroupAction}>
                <input type="hidden" name="modifierGroupId" value={group.id} />
                <ConfirmSubmitButton confirmation="Remover este grupo do catálogo? Produtos e pedidos antigos serão preservados.">Remover grupo</ConfirmSubmitButton>
              </ResilientMutationForm>

              <div style={{ display: "grid", gap: 10 }}>
                {items.length === 0 ? <span className="muted">Nenhuma opção neste grupo.</span> : items.map((item) => (
                  <section key={item.id} style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <span>{item.name} {!item.active ? <span className="muted">· inativo</span> : null}</span>
                      <span className="muted">+ {formatCents(item.price_cents)}{quantityMode ? " por unidade" : ""}</span>
                    </div>
                    <details>
                      <summary style={{ cursor: "pointer" }}>Editar opção</summary>
                      <ResilientMutationForm action={updateModifierFormAction} successReset={false} style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <input type="hidden" name="modifierId" value={item.id} />
                        <label style={{ display: "grid", gap: 6 }} htmlFor={`modifier-${item.id}-group`}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>Grupo</span>
                          <select id={`modifier-${item.id}-group`} name="modifierGroupId" required defaultValue={item.modifier_group_id} style={selectStyle}>
                            {groups.map((optionGroup) => <option key={optionGroup.id} value={optionGroup.id}>{optionGroup.name}</option>)}
                          </select>
                        </label>
                        <Input id={`modifier-${item.id}-name`} label="Nome" name="name" required defaultValue={item.name} />
                        <Input id={`modifier-${item.id}-price`} label="Preço adicional" name="price" inputMode="decimal" required defaultValue={editableMoney(item.price_cents)} />
                        <Input id={`modifier-${item.id}-order`} label="Ordem" name="sortOrder" type="number" min={0} defaultValue={item.sort_order} />
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="active" type="checkbox" defaultChecked={item.active} /> Ativo</label>
                        <Button type="submit">Salvar opção</Button>
                      </ResilientMutationForm>
                    </details>
                    <ResilientMutationForm action={removeModifierAction}>
                      <input type="hidden" name="modifierId" value={item.id} />
                      <ConfirmSubmitButton confirmation="Remover esta opção? Pedidos antigos serão preservados.">Remover opção</ConfirmSubmitButton>
                    </ResilientMutationForm>
                  </section>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
