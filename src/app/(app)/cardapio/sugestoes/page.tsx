import { Button } from "@/components/ui/button";
import { Checkbox, Input, QuantityInput, SelectField } from "@/components/ui/form-controls";
import { CatalogSectionHeader } from "@/features/catalog/catalog-list";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { saveComplementCategoriesAction, saveComplementCategoryRulesAction } from "@/features/menu/complement-actions";
import { ComplementCategoryService } from "@/server/menu/complement-category-service";
import styles from "../catalog-management.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ComplementSettingsPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const query = await searchParams;
  const { businessType, categories, rules } = await ComplementCategoryService.loadAdminSettings();
  const restaurant = businessType === "restaurant";
  const activeCategories = categories.filter((category) => category.active);
  const requestedSource = typeof query.source === "string" && uuidPattern.test(query.source) ? query.source : null;
  const sourceCategory = activeCategories.find((category) => category.id === requestedSource) ?? activeCategories[0] ?? null;
  const sourceRules = sourceCategory ? rules.filter((rule) => rule.sourceCategoryId === sourceCategory.id) : [];
  const sourceRuleMap = new Map(sourceRules.map((rule) => [rule.targetCategoryId, rule]));

  return <section className={styles.page}>
    <CatalogSectionHeader
      title="Sugestões durante o pedido"
      description="Escolha o que aparece como complemento enquanto o cliente monta o produto, por categoria ou numa regra geral."
    />

    <section className={`card ${styles.sectionCard}`} aria-labelledby="sugestoes-por-categoria">
      <div className={styles.sectionCardHeader}>
        <h3 id="sugestoes-por-categoria">Por categoria</h3>
        <p className={styles.formHint}>Crie sequências como <strong>Salgados → Churros → Bebidas</strong>, defina a ordem e troque o título exibido ao cliente, por exemplo “Vai um docinho?”.</p>
      </div>
      {activeCategories.length === 0 ? <p className="muted">Crie e ative pelo menos uma categoria antes de configurar regras específicas.</p> : <>
        <form method="get" className={styles.suggestionSourceForm}>
          <div className={styles.suggestionSourceControls}>
            <SelectField id="source-category" name="source" label="Quando o cliente estiver comprando um item de" defaultValue={sourceCategory?.id}>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </SelectField>
            <Button type="submit" tone="secondary">Ver sugestões</Button>
          </div>
        </form>

        {sourceCategory ? <ResilientMutationForm action={saveComplementCategoryRulesAction} successReset={false} className={styles.editBody}>
          <input type="hidden" name="sourceCategoryId" value={sourceCategory.id} />
          <div className={styles.sectionCardHeader}>
            <h3>Sugerir depois de {sourceCategory.name}</h3>
            <p className={styles.formHint}>Marque as categorias desejadas. Ordem menor aparece primeiro. O título é opcional; vazio mantém o texto padrão.</p>
          </div>
          <div className={styles.productList} role="list">
            {categories.filter((category) => category.id !== sourceCategory.id).map((category) => {
              const rule = sourceRuleMap.get(category.id);
              return <div key={category.id} className={styles.suggestionRuleRow} role="listitem">
                <Checkbox id={`suggestion-target-${category.id}`} name="targetCategoryId" value={category.id} defaultChecked={Boolean(rule)} disabled={!category.active} label={`${category.name}${!category.active ? " · inativa" : ""}`} />
                <Input id={`suggestion-title-${category.id}`} label="Título para o cliente" name={`rule_title_${category.id}`} maxLength={80} defaultValue={rule?.title ?? ""} placeholder={category.name === "Churros" ? "Ex.: Vai um docinho?" : "Opcional"} disabled={!category.active} />
                <QuantityInput id={`suggestion-rule-order-${category.id}`} label="Ordem" name={`rule_order_${category.id}`} min={0} max={10000} defaultValue={rule?.sortOrder ?? category.sortOrder} />
              </div>;
            })}
          </div>
          <p className={styles.formHint}>{sourceRules.length > 0 ? `${sourceRules.length} categoria(s) configurada(s) especificamente para ${sourceCategory.name}.` : `Nenhuma regra específica para ${sourceCategory.name}; hoje ela herda as sugestões gerais abaixo.`}</p>
          <div className={styles.managementActions}><Button type="submit">Salvar sugestões de {sourceCategory.name}</Button></div>
        </ResilientMutationForm> : null}
      </>}
    </section>

    <section className={`card ${styles.sectionCard}`} aria-labelledby="sugestoes-gerais">
      <div className={styles.sectionCardHeader}>
        <h3 id="sugestoes-gerais">Sugestões gerais</h3>
        <p className={styles.formHint}>{restaurant ? "Valem quando a categoria de origem não possui regra específica. Para restaurantes, Bebidas é sugerida inicialmente quando existe uma correspondência única e segura." : "Valem quando a categoria de origem não possui regra específica. Nada é ativado automaticamente para este perfil."}</p>
      </div>
      <ResilientMutationForm action={saveComplementCategoriesAction} successReset={false} className={styles.editBody}>
        {categories.length === 0 ? <p className="muted">Crie uma categoria primeiro para configurar sugestões.</p> : <div className={styles.productList} role="list">
          {categories.map((category) => <div key={category.id} className={styles.suggestionRow} role="listitem">
            <Checkbox id={`suggestion-global-${category.id}`} name="categoryId" value={category.id} defaultChecked={category.selected} disabled={!category.active} label={`${category.name}${category.suggestedDefault ? " · sugestão padrão" : ""}${!category.active ? " · inativa" : ""}`} />
            <QuantityInput id={`suggestion-global-order-${category.id}`} label="Ordem" name={`order_${category.id}`} min={0} max={10000} defaultValue={category.sortOrder} />
          </div>)}
        </div>}
        <p className={styles.formHint}>Categorias inativas ou sem produtos disponíveis não aparecem ao consumidor. Desmarcar uma categoria não apaga produtos nem histórico.</p>
        <div className={styles.managementActions}><Button type="submit" disabled={categories.length === 0}>Salvar sugestões gerais</Button></div>
      </ResilientMutationForm>
    </section>
  </section>;
}
