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
import { CatalogRow, CatalogSectionHeader } from "@/features/catalog/catalog-list";
import { CatalogSwitch } from "@/features/catalog/catalog-switch";
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
  return <QuantityInput id={id} label="Total a distribuir (divisão igual)" name="distributionTotal" min={1} max={100} defaultValue={defaultValue ?? ""} hint="Só no modo de divisão igual. Ex.: 50 para uma caixa com 50 unidades." />;
}

export default async function ModifiersPage() {
  const [groups, modifiers] = await Promise.all([
    ModifierService.listGroups(),
    ModifierService.listModifiers(),
  ]);
  const activeGroups = groups.filter((group) => group.active).length;

  const newGroupForm = (
    <ResilientMutationForm action={createModifierGroupFormAction} className={styles.editBody}>
      <p className={styles.formHint}>Reúna escolhas como sabores, tamanhos ou acompanhamentos e defina a regra do grupo.</p>
      <div className={styles.formGrid}>
        <Input id="new-group-name" label="Nome" name="name" required />
        <Input id="new-group-description" label="Descrição" name="description" />
      </div>
      <SelectionModeField id="new-group-selection-mode" />
      <div className={styles.formGrid}>
        <QuantityInput id="new-group-min" label="Mínimo de opções/unidades" name="minSelection" min={0} defaultValue={0} />
        <QuantityInput id="new-group-max" label="Máximo de opções/unidades" name="maxSelection" min={1} defaultValue={1} />
      </div>
      <div className={styles.formGrid}>
        <DistributionTotalField id="new-group-distribution-total" />
        <QuantityInput id="new-group-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
      </div>
      <div className={styles.checkRow}>
        <Checkbox id="new-group-required" name="required" label="Obrigatório" />
        <Checkbox id="new-group-active" name="active" label="Ativo" defaultChecked />
      </div>
      <div className={styles.managementActions}><Button type="submit">Criar grupo</Button></div>
    </ResilientMutationForm>
  );

  const newOptionForm = (
    <ResilientMutationForm action={createModifierFormAction} className={styles.editBody}>
      <p className={styles.formHint}>Escolha o grupo ao qual esta opção pertence. O preço é o acréscimo por unidade.</p>
      <SelectField id="new-modifier-group" name="modifierGroupId" label="Grupo" required disabled={groups.length === 0}>
        {groups.length === 0 ? <option value="">Crie um grupo primeiro</option> : groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </SelectField>
      <div className={styles.formGrid}>
        <Input id="new-modifier-name" label="Nome" name="name" required />
        <MoneyInput id="new-modifier-price" label="Preço adicional por unidade" name="price" defaultValue="0,00" required />
      </div>
      <div className={styles.formGrid}>
        <QuantityInput id="new-modifier-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
        <div className={styles.checkRow}><Checkbox id="new-modifier-active" name="active" label="Ativo" defaultChecked /></div>
      </div>
      <div className={styles.managementActions}><Button type="submit" disabled={groups.length === 0}>Criar opção</Button></div>
    </ResilientMutationForm>
  );

  return (
    <section className={styles.page}>
      <CatalogSectionHeader
        title="Adicionais, tamanhos e sabores"
        description="Configure cada grupo conforme a operação do restaurante: escolha comum, quantidade manual ou divisão automática."
        actions={[
          { id: "novo-grupo", label: "Novo grupo", content: newGroupForm },
          { id: "nova-opcao", label: "Nova opção", secondary: true, content: newOptionForm },
        ]}
      />

      <div className={styles.summary} aria-label="Resumo dos adicionais">
        <span><strong>{groups.length}</strong> grupos</span>
        <span><strong>{activeGroups}</strong> ativos</span>
        <span><strong>{modifiers.length}</strong> opções</span>
      </div>

      {groups.length === 0 ? (
        <article className={`card ${styles.empty}`}>
          <h2>Nenhum grupo cadastrado</h2>
          <p className="muted">Toque em Novo grupo para criar tamanhos, sabores ou adicionais.</p>
        </article>
      ) : null}

      <div className={styles.groupList}>
        {groups.map((group) => {
          const items = modifiers.filter((modifier) => modifier.modifier_group_id === group.id);
          const quantityMode = group.selection_mode === "quantity_per_option";
          const equalSplitMode = group.selection_mode === "equal_split_options";
          const pricedPerUnit = quantityMode || equalSplitMode;
          const rule = equalSplitMode
            ? `${group.min_selection}–${group.max_selection} opção(ões) · divide ${group.distribution_total ?? "?"} unidades`
            : quantityMode ? `${group.min_selection}–${group.max_selection} unidades no total` : `${group.min_selection}–${group.max_selection} seleção(ões)`;
          return (
            <section key={group.id} className={styles.groupCard} aria-label={`Grupo ${group.name}`}>
              <div className={styles.productList} role="list">
                <CatalogRow
                  main={<>
                    <div className={styles.productTitleRow}>
                      <span className={styles.productName}>{group.name}</span>
                      <span className={styles.stateBadge} data-active={group.active}>{group.active ? "Ativo" : "Pausado"}</span>
                    </div>
                    {group.description ? <p className={styles.productDescription}>{group.description}</p> : null}
                    <div className={styles.productMeta}>
                      <span className={styles.metaChip}>{group.required ? "Obrigatório" : "Opcional"}</span>
                      <span className={styles.metaChip}>{rule}</span>
                      <span className={styles.metaChip}>{items.length === 1 ? "1 opção" : `${items.length} opções`}</span>
                      <span className={styles.metaChip}>Ordem {group.sort_order}</span>
                    </div>
                    {quantityMode ? <p className={styles.formHint}>O máximo é um teto. Quando mínimo e máximo são iguais, o cliente precisa completar exatamente essa quantidade. Caso contrário, pode continuar assim que o mínimo estiver atendido.</p> : null}
                    {equalSplitMode ? <p className={styles.formHint}>O cliente escolhe entre o mínimo e o máximo de opções; o total configurado é repartido igualmente entre elas.</p> : null}
                  </>}
                  toggle={<CatalogSwitch
                    action={setModifierGroupActiveFormAction}
                    fields={{ modifierGroupId: group.id, active: group.active ? "false" : "true" }}
                    on={group.active}
                    label="Ativo"
                    actionLabel={`${group.active ? "Pausar grupo" : "Reativar grupo"}: ${group.name}`}
                  />}
                  editLabel={`Editar grupo ${group.name}`}
                  editor={
                    <ResilientMutationForm action={updateModifierGroupFormAction} successReset={false} className={styles.editBody}>
                      <input type="hidden" name="modifierGroupId" value={group.id} />
                      <div className={styles.formGrid}>
                        <Input id={`group-${group.id}-name`} label="Nome" name="name" required defaultValue={group.name} />
                        <Input id={`group-${group.id}-description`} label="Descrição" name="description" defaultValue={group.description ?? ""} />
                      </div>
                      <SelectionModeField id={`group-${group.id}-selection-mode`} defaultValue={group.selection_mode ?? "distinct_choices"} />
                      <div className={styles.formGrid}>
                        <QuantityInput id={`group-${group.id}-min`} label="Mínimo de opções/unidades" name="minSelection" min={0} defaultValue={group.min_selection} />
                        <QuantityInput id={`group-${group.id}-max`} label="Máximo de opções/unidades" name="maxSelection" min={1} defaultValue={group.max_selection} />
                      </div>
                      <div className={styles.formGrid}>
                        <DistributionTotalField id={`group-${group.id}-distribution-total`} defaultValue={group.distribution_total} />
                        <QuantityInput id={`group-${group.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={group.sort_order} />
                      </div>
                      <div className={styles.checkRow}>
                        <Checkbox id={`group-${group.id}-required`} name="required" label="Obrigatório" defaultChecked={group.required} />
                        <Checkbox id={`group-${group.id}-active`} name="active" label="Ativo" defaultChecked={group.active} />
                      </div>
                      <div className={styles.managementActions}><Button type="submit">Salvar grupo</Button></div>
                    </ResilientMutationForm>
                  }
                  menuLabel={`Ações do grupo ${group.name}`}
                  menu={
                    <ResilientMutationForm action={removeModifierGroupAction} className={styles.menuForm}>
                      <input type="hidden" name="modifierGroupId" value={group.id} />
                      <ConfirmSubmitButton tone="secondary" confirmation="Remover este grupo do catálogo? Produtos e pedidos antigos serão preservados.">Remover grupo</ConfirmSubmitButton>
                    </ResilientMutationForm>
                  }
                />
                {items.length === 0 ? <p className={styles.subEmpty}>Nenhuma opção neste grupo. Use Nova opção para adicionar.</p> : items.map((item) => (
                  <CatalogRow
                    key={item.id}
                    compact
                    main={<div className={styles.productTitleRow}>
                      <span>{item.name}</span>
                      {!item.active ? <span className={styles.stateBadge} data-active={false}>Pausada</span> : null}
                    </div>}
                    aside={<span className={styles.optionPrice}>{item.price_cents > 0 ? `+ ${formatCents(item.price_cents)}` : "Sem acréscimo"}{pricedPerUnit && item.price_cents > 0 ? " por unidade" : ""}</span>}
                    editLabel={`Editar opção ${item.name}`}
                    editor={
                      <ResilientMutationForm action={updateModifierFormAction} successReset={false} className={styles.editBody}>
                        <input type="hidden" name="modifierId" value={item.id} />
                        <div className={styles.formGrid}>
                          <Input id={`modifier-${item.id}-name`} label="Nome" name="name" required defaultValue={item.name} />
                          <MoneyInput id={`modifier-${item.id}-price`} label="Preço adicional" name="price" required defaultValue={editableMoney(item.price_cents)} />
                        </div>
                        <div className={styles.formGrid}>
                          <SelectField id={`modifier-${item.id}-group`} name="modifierGroupId" label="Grupo" required defaultValue={item.modifier_group_id}>
                            {groups.map((optionGroup) => <option key={optionGroup.id} value={optionGroup.id}>{optionGroup.name}</option>)}
                          </SelectField>
                          <QuantityInput id={`modifier-${item.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={item.sort_order} />
                        </div>
                        <Checkbox id={`modifier-${item.id}-active`} name="active" label="Ativo" defaultChecked={item.active} />
                        <div className={styles.managementActions}><Button type="submit">Salvar opção</Button></div>
                      </ResilientMutationForm>
                    }
                    menuLabel={`Ações da opção ${item.name}`}
                    menu={<>
                      <ResilientMutationForm action={setModifierActiveFormAction} className={styles.menuForm}>
                        <input type="hidden" name="modifierId" value={item.id} />
                        <input type="hidden" name="active" value={item.active ? "false" : "true"} />
                        <Checkbox id={`modifier-${item.id}-matching`} name="allMatching" label="Aplicar ao mesmo sabor em todos os grupos" defaultChecked />
                        <Button type="submit" tone="secondary">{item.active ? "Pausar opção" : "Reativar opção"}</Button>
                      </ResilientMutationForm>
                      <ResilientMutationForm action={removeModifierAction} className={styles.menuForm}>
                        <input type="hidden" name="modifierId" value={item.id} />
                        <ConfirmSubmitButton tone="secondary" confirmation="Remover esta opção? Pedidos antigos serão preservados.">Remover opção</ConfirmSubmitButton>
                      </ResilientMutationForm>
                    </>}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
