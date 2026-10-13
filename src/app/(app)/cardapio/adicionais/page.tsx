import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Checkbox, Input, MoneyInput, QuantityInput, SelectField } from "@/components/ui/form-controls";
import { ModifierService } from "@/server/catalog/modifier-service";
import {
  createModifierFormAction,
  createModifierGroupFormAction,
  removeModifierAction,
  removeModifierGroupAction,
  setModifierActiveFormAction,
  setModifierGroupActiveFormAction,
  updateModifierFormAction,
  updateModifierGroupFormAction,
} from "@/features/catalog/actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { formatCents } from "@/server/catalog/money";
import styles from "../catalog-management.module.css";

function editableMoney(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function SelectionModeField({ id, defaultValue = "distinct_choices" }: { id: string; defaultValue?: string }) {
  return <SelectField id={id} name="selectionMode" label="Como o cliente escolhe" defaultValue={defaultValue} hint="Quantidade manual: o cliente distribui unidades entre opções. Para exigir exatamente 25, configure mínimo 25, máximo 25 e marque Obrigatório. Na divisão igual, o PedeAqui calcula a distribuição.">
      <option value="distinct_choices">Escolha simples ou múltipla</option>
      <option value="quantity_per_option">Quantidade manual por opção (− / +)</option>
      <option value="equal_split_options">Dividir igualmente entre opções escolhidas (− / +)</option>
  </SelectField>;
}

function DistributionTotalField({ id, defaultValue }: { id: string; defaultValue?: number | null }) {
  return <div style={{ display: "grid", gap: 4 }}>
    <QuantityInput id={id} label="Total a distribuir (divisão igual)" name="distributionTotal" min={1} max={100} defaultValue={defaultValue ?? ""} />
    <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Preencha somente no modo de divisão igual. Ex.: 50 para uma caixa com 50 unidades.</span>
  </div>;
}

export default async function ModifiersPage() {
  const [groups, modifiers] = await Promise.all([
    ModifierService.listGroups(),
    ModifierService.listModifiers(),
  ]);

  return (
    <section className={styles.page}>
      <div className={styles.headerCopy}>
        <h2>Adicionais, tamanhos e sabores</h2>
        <p className="muted">Configure cada grupo conforme a operação do restaurante: escolha comum, quantidade manual ou divisão automática.</p>
      </div>

      <div className={styles.createGrid}>
        <details className={styles.createDetails}>
          <summary>Novo grupo</summary>
        <ResilientMutationForm action={createModifierGroupFormAction} className={styles.editBody}>
          <p className={styles.formHint}>Reúna escolhas como sabores, tamanhos ou acompanhamentos e defina a regra do grupo.</p>
          <Input id="new-group-name" label="Nome" name="name" required />
          <Input id="new-group-description" label="Descrição" name="description" />
          <SelectionModeField id="new-group-selection-mode" />
          <div className={styles.formGrid}>
            <QuantityInput id="new-group-min" label="Mínimo de opções/unidades" name="minSelection" min={0} defaultValue={0} />
            <QuantityInput id="new-group-max" label="Máximo de opções/unidades" name="maxSelection" min={1} defaultValue={1} />
          </div>
          <DistributionTotalField id="new-group-distribution-total" />
          <QuantityInput id="new-group-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
          <Checkbox id="new-group-required" name="required" label="Obrigatório" />
          <Checkbox id="new-group-active" name="active" label="Ativo" defaultChecked />
          <Button type="submit">Criar grupo</Button>
        </ResilientMutationForm>
        </details>

        <details className={styles.createDetails}>
          <summary>Novo adicional ou opção</summary>
        <ResilientMutationForm action={createModifierFormAction} className={styles.editBody}>
          <p className={styles.formHint}>Escolha o grupo ao qual esta opção pertence. O preço é o acréscimo por unidade.</p>
          <SelectField id="new-modifier-group" name="modifierGroupId" label="Grupo" required disabled={groups.length === 0}>
              {groups.length === 0 ? <option value="">Crie um grupo primeiro</option> : groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </SelectField>
          <Input id="new-modifier-name" label="Nome" name="name" required />
          <MoneyInput id="new-modifier-price" label="Preço adicional por unidade" name="price" defaultValue="0,00" required />
          <QuantityInput id="new-modifier-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
          <Checkbox id="new-modifier-active" name="active" label="Ativo" defaultChecked />
          <Button type="submit" disabled={groups.length === 0}>Criar opção</Button>
        </ResilientMutationForm>
        </details>
      </div>

      <div className={styles.managementList}>
        {groups.length === 0 ? <article className="card" style={{ padding: 18 }}><span className="muted">Nenhum grupo cadastrado.</span></article> : null}
        {groups.map((group) => {
          const items = modifiers.filter((modifier) => modifier.modifier_group_id === group.id);
          const quantityMode = group.selection_mode === "quantity_per_option";
          const equalSplitMode = group.selection_mode === "equal_split_options";
          const pricedPerUnit = quantityMode || equalSplitMode;
          return (
            <article key={group.id} className={`card ${styles.managementCard}`}>
              <div className={styles.managementTop}>
                <div>
                  <strong>{group.name}</strong>
                  <div className="muted" style={{ fontSize: "var(--font-size-support)" }}>
                    {group.required ? "Obrigatório" : "Opcional"} · {equalSplitMode ? `${group.min_selection}–${group.max_selection} opção(ões) · divide ${group.distribution_total ?? "?"} unidades` : quantityMode ? `${group.min_selection}–${group.max_selection} unidades no total` : `${group.min_selection}–${group.max_selection} seleção(ões)`} · {items.length} opção(ões) · ordem {group.sort_order}
                  </div>
                  {quantityMode ? <div className="muted" style={{ fontSize: "var(--font-size-support)" }}>O máximo é um teto. Quando mínimo e máximo são iguais, o cliente precisa completar exatamente essa quantidade. Caso contrário, pode continuar assim que o mínimo estiver atendido.</div> : null}
                  {equalSplitMode ? <div className="muted" style={{ fontSize: "var(--font-size-support)" }}>O cliente escolhe entre o mínimo e o máximo de opções; o total configurado é repartido igualmente entre elas.</div> : null}
                </div>
                <span className={styles.stateBadge} data-active={group.active}>{group.active ? "Ativo" : "Pausado"}</span>
              </div>

              <ResilientMutationForm action={setModifierGroupActiveFormAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input type="hidden" name="modifierGroupId" value={group.id} />
                <input type="hidden" name="active" value={group.active ? "false" : "true"} />
                <Button type="submit" tone="secondary">{group.active ? "Pausar grupo" : "Reativar grupo"}</Button>
              </ResilientMutationForm>

              <details className={styles.editDetails}>
                <summary>Editar grupo</summary>
                <ResilientMutationForm action={updateModifierGroupFormAction} successReset={false} className={styles.editBody}>
                  <input type="hidden" name="modifierGroupId" value={group.id} />
                  <Input id={`group-${group.id}-name`} label="Nome" name="name" required defaultValue={group.name} />
                  <Input id={`group-${group.id}-description`} label="Descrição" name="description" defaultValue={group.description ?? ""} />
                  <SelectionModeField id={`group-${group.id}-selection-mode`} defaultValue={group.selection_mode ?? "distinct_choices"} />
                  <div className={styles.formGrid}>
                    <QuantityInput id={`group-${group.id}-min`} label="Mínimo de opções/unidades" name="minSelection" min={0} defaultValue={group.min_selection} />
                    <QuantityInput id={`group-${group.id}-max`} label="Máximo de opções/unidades" name="maxSelection" min={1} defaultValue={group.max_selection} />
                  </div>
                  <DistributionTotalField id={`group-${group.id}-distribution-total`} defaultValue={group.distribution_total} />
                  <QuantityInput id={`group-${group.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={group.sort_order} />
                  <Checkbox id={`group-${group.id}-required`} name="required" label="Obrigatório" defaultChecked={group.required} />
                  <Checkbox id={`group-${group.id}-active`} name="active" label="Ativo" defaultChecked={group.active} />
                  <Button type="submit">Salvar grupo</Button>
                </ResilientMutationForm>
              </details>

              <details className={styles.editDetails}>
                <summary>Remover grupo</summary>
              <ResilientMutationForm action={removeModifierGroupAction} className={styles.editBody}>
                <input type="hidden" name="modifierGroupId" value={group.id} />
                <ConfirmSubmitButton confirmation="Remover este grupo do catálogo? Produtos e pedidos antigos serão preservados.">Remover grupo</ConfirmSubmitButton>
              </ResilientMutationForm>
              </details>

              <div className={styles.optionList}>
                {items.length === 0 ? <span className="muted">Nenhuma opção neste grupo.</span> : items.map((item) => (
                  <section key={item.id} className={styles.optionRow}>
                    <div className={styles.managementTop}>
                      <span>{item.name} {!item.active ? <span className="muted">· pausado</span> : null}</span>
                      <span className="muted">+ {formatCents(item.price_cents)}{pricedPerUnit ? " por unidade" : ""}</span>
                    </div>
                    <details className={styles.editDetails}>
                      <summary>Gerenciar opção: {item.name}</summary>
                      <div className={styles.editBody}>
                    <ResilientMutationForm action={setModifierActiveFormAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <input type="hidden" name="modifierId" value={item.id} />
                      <input type="hidden" name="active" value={item.active ? "false" : "true"} />
                      <Checkbox id={`modifier-${item.id}-matching`} name="allMatching" label="Aplicar ao mesmo sabor em todos os grupos" defaultChecked />
                      <Button type="submit" tone="secondary">{item.active ? "Pausar opção" : "Reativar opção"}</Button>
                    </ResilientMutationForm>
                    <details className={styles.editDetails}>
                      <summary>Editar opção</summary>
                      <ResilientMutationForm action={updateModifierFormAction} successReset={false} className={styles.editBody}>
                        <input type="hidden" name="modifierId" value={item.id} />
                        <SelectField id={`modifier-${item.id}-group`} name="modifierGroupId" label="Grupo" required defaultValue={item.modifier_group_id}>
                            {groups.map((optionGroup) => <option key={optionGroup.id} value={optionGroup.id}>{optionGroup.name}</option>)}
                        </SelectField>
                        <Input id={`modifier-${item.id}-name`} label="Nome" name="name" required defaultValue={item.name} />
                        <MoneyInput id={`modifier-${item.id}-price`} label="Preço adicional" name="price" required defaultValue={editableMoney(item.price_cents)} />
                        <QuantityInput id={`modifier-${item.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={item.sort_order} />
                        <Checkbox id={`modifier-${item.id}-active`} name="active" label="Ativo" defaultChecked={item.active} />
                        <Button type="submit">Salvar opção</Button>
                      </ResilientMutationForm>
                    </details>
                    <ResilientMutationForm action={removeModifierAction}>
                      <input type="hidden" name="modifierId" value={item.id} />
                      <ConfirmSubmitButton confirmation="Remover esta opção? Pedidos antigos serão preservados.">Remover opção</ConfirmSubmitButton>
                    </ResilientMutationForm>
                      </div>
                    </details>
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
