import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Checkbox, Input, MoneyInput, QuantityInput, SelectField } from "@/components/ui/form-controls";
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

function editableMoney(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function SelectionModeField({ id, defaultValue = "distinct_choices" }: { id: string; defaultValue?: string }) {
  return <SelectField id={id} name="selectionMode" label="Como o cliente escolhe" defaultValue={defaultValue} hint="Na divisão igual, o PedeAqui calcula automaticamente quantas unidades ficam em cada opção.">
      <option value="distinct_choices">Escolha simples ou múltipla</option>
      <option value="quantity_per_option">Quantidade manual por opção (− / +)</option>
      <option value="equal_split_options">Dividir igualmente entre opções escolhidas (− / +)</option>
  </SelectField>;
}

function DistributionTotalField({ id, defaultValue }: { id: string; defaultValue?: number | null }) {
  return <div style={{ display: "grid", gap: 4 }}>
    <QuantityInput id={id} label="Total a distribuir (divisão igual)" name="distributionTotal" min={1} max={100} defaultValue={defaultValue ?? ""} />
    <span className="muted" style={{ fontSize: 12 }}>Preencha somente no modo de divisão igual. Ex.: 50 para uma caixa com 50 unidades.</span>
  </div>;
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
        <p className="muted">Configure cada grupo conforme a operação do restaurante: escolha comum, quantidade manual ou divisão automática.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <ResilientMutationForm action={createModifierGroupFormAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo grupo</h2>
          <Input id="new-group-name" label="Nome" name="name" required />
          <Input id="new-group-description" label="Descrição" name="description" />
          <SelectionModeField id="new-group-selection-mode" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <QuantityInput id="new-group-min" label="Mínimo de opções/unidades" name="minSelection" min={0} defaultValue={0} />
            <QuantityInput id="new-group-max" label="Máximo de opções/unidades" name="maxSelection" min={1} defaultValue={1} />
          </div>
          <DistributionTotalField id="new-group-distribution-total" />
          <QuantityInput id="new-group-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
          <Checkbox name="required" label="Obrigatório" />
          <Checkbox name="active" label="Ativo" defaultChecked />
          <Button type="submit">Criar grupo</Button>
        </ResilientMutationForm>

        <ResilientMutationForm action={createModifierFormAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo adicional ou opção</h2>
          <SelectField id="new-modifier-group" name="modifierGroupId" label="Grupo" required disabled={groups.length === 0}>
              {groups.length === 0 ? <option value="">Crie um grupo primeiro</option> : groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </SelectField>
          <Input id="new-modifier-name" label="Nome" name="name" required />
          <MoneyInput id="new-modifier-price" label="Preço adicional por unidade" name="price" defaultValue="0,00" required />
          <QuantityInput id="new-modifier-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
          <Checkbox name="active" label="Ativo" defaultChecked />
          <Button type="submit" disabled={groups.length === 0}>Criar opção</Button>
        </ResilientMutationForm>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {groups.length === 0 ? <article className="card" style={{ padding: 18 }}><span className="muted">Nenhum grupo cadastrado.</span></article> : null}
        {groups.map((group) => {
          const items = modifiers.filter((modifier) => modifier.modifier_group_id === group.id);
          const quantityMode = group.selection_mode === "quantity_per_option";
          const equalSplitMode = group.selection_mode === "equal_split_options";
          const pricedPerUnit = quantityMode || equalSplitMode;
          return (
            <article key={group.id} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{group.name}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {group.required ? "Obrigatório" : "Opcional"} · {equalSplitMode ? `${group.min_selection}–${group.max_selection} opção(ões) · divide ${group.distribution_total ?? "?"} unidades` : quantityMode ? `${group.min_selection}–${group.max_selection} unidades no total` : `${group.min_selection}–${group.max_selection} seleção(ões)`} · ordem {group.sort_order}
                  </div>
                  {quantityMode ? <div className="muted" style={{ fontSize: 12 }}>O máximo é um teto. O cliente pode continuar antes dele assim que o mínimo estiver atendido.</div> : null}
                  {equalSplitMode ? <div className="muted" style={{ fontSize: 12 }}>O cliente escolhe entre o mínimo e o máximo de opções; o total configurado é repartido igualmente entre elas.</div> : null}
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
                    <QuantityInput id={`group-${group.id}-min`} label="Mínimo de opções/unidades" name="minSelection" min={0} defaultValue={group.min_selection} />
                    <QuantityInput id={`group-${group.id}-max`} label="Máximo de opções/unidades" name="maxSelection" min={1} defaultValue={group.max_selection} />
                  </div>
                  <DistributionTotalField id={`group-${group.id}-distribution-total`} defaultValue={group.distribution_total} />
                  <QuantityInput id={`group-${group.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={group.sort_order} />
                  <Checkbox name="required" label="Obrigatório" defaultChecked={group.required} />
                  <Checkbox name="active" label="Ativo" defaultChecked={group.active} />
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
                      <span className="muted">+ {formatCents(item.price_cents)}{pricedPerUnit ? " por unidade" : ""}</span>
                    </div>
                    <details>
                      <summary style={{ cursor: "pointer" }}>Editar opção</summary>
                      <ResilientMutationForm action={updateModifierFormAction} successReset={false} style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <input type="hidden" name="modifierId" value={item.id} />
                        <SelectField id={`modifier-${item.id}-group`} name="modifierGroupId" label="Grupo" required defaultValue={item.modifier_group_id}>
                            {groups.map((optionGroup) => <option key={optionGroup.id} value={optionGroup.id}>{optionGroup.name}</option>)}
                        </SelectField>
                        <Input id={`modifier-${item.id}-name`} label="Nome" name="name" required defaultValue={item.name} />
                        <MoneyInput id={`modifier-${item.id}-price`} label="Preço adicional" name="price" required defaultValue={editableMoney(item.price_cents)} />
                        <QuantityInput id={`modifier-${item.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={item.sort_order} />
                        <Checkbox name="active" label="Ativo" defaultChecked={item.active} />
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
