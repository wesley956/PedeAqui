import { Button } from "@/components/ui/button";
import { Checkbox, Input, QuantityInput } from "@/components/ui/form-controls";
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
    <header className={styles.headerCopy}><h2>Sugestões durante o pedido</h2><p className="muted">Configure o que aparece como complemento durante a montagem do produto. Defina sugestões por categoria ou uma configuração geral para as demais categorias.</p></header>

    <div className={`card ${styles.formCard}`}>
      <div className={styles.promotionSectionHeader}><h2>Por categoria</h2><p className={styles.formHint}>Use esta área para criar sequências como <strong>Salgados → Churros → Bebidas</strong>, definir a ordem e trocar o título exibido ao cliente, por exemplo “Vai um docinho?”.</p></div>
      {activeCategories.length === 0 ? <div className="muted">Crie e ative pelo menos uma categoria antes de configurar regras específicas.</div> : <>
        <form method="get" className={styles.suggestionSourceForm}>
          <label htmlFor="source-category" style={{ fontWeight: "var(--font-weight-bold)" }}>Quando o cliente estiver comprando um item de</label>
          <div className={styles.suggestionSourceControls}>
            <select id="source-category" name="source" defaultValue={sourceCategory?.id} style={{ minHeight: 44, borderRadius: "var(--radius-sm)", border: "var(--border-width) solid var(--border-default)", background: "var(--surface-2)", color: "var(--text-primary)", padding: "8px 10px" }}>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <Button type="submit" tone="secondary">Carregar categoria</Button>
          </div>
        </form>

        {sourceCategory ? <ResilientMutationForm action={saveComplementCategoryRulesAction} successReset={false} className={styles.formCard}>
          <input type="hidden" name="sourceCategoryId" value={sourceCategory.id} />
          <div className={styles.sectionCopy}><h2>Sugerir depois de {sourceCategory.name}</h2><p className={styles.formHint}>Marque as categorias desejadas. Ordem menor aparece primeiro. O título é opcional; vazio mantém o texto padrão.</p></div>
          {categories.filter((category) => category.id !== sourceCategory.id).map((category) => {
            const rule = sourceRuleMap.get(category.id);
            return <div key={category.id} className={styles.suggestionRuleRow}>
              <Checkbox id={`suggestion-target-${category.id}`} name="targetCategoryId" value={category.id} defaultChecked={Boolean(rule)} disabled={!category.active} label={`${category.name}${!category.active ? " · inativa" : ""}`} />
              <Input id={`suggestion-title-${category.id}`} label="Título para o cliente" name={`rule_title_${category.id}`} maxLength={80} defaultValue={rule?.title ?? ""} placeholder={category.name === "Churros" ? "Ex.: Vai um docinho?" : "Opcional"} disabled={!category.active} />
              <QuantityInput id={`suggestion-rule-order-${category.id}`} label="Ordem" name={`rule_order_${category.id}`} min={0} max={10000} defaultValue={rule?.sortOrder ?? category.sortOrder} />
            </div>;
          })}
          <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>{sourceRules.length > 0 ? `${sourceRules.length} categoria(s) configurada(s) especificamente para ${sourceCategory.name}.` : `Nenhuma regra específica para ${sourceCategory.name}; hoje ela herda a configuração global abaixo.`}</p>
          <Button type="submit">Salvar regra de {sourceCategory.name}</Button>
        </ResilientMutationForm> : null}
      </>}
    </div>

    <details className={styles.createDetails}>
      <summary>Sugestões gerais</summary>
    <ResilientMutationForm action={saveComplementCategoriesAction} successReset={false} className={styles.editBody}>
      <div><p className={styles.formHint}>{restaurant ? "Estas sugestões valem quando a categoria de origem não possui regra específica. Para restaurantes, Bebidas é sugerida inicialmente quando existe uma correspondência única e segura." : "Estas sugestões valem quando a categoria de origem não possui regra específica. Nada é ativado automaticamente para este perfil."}</p></div>
      {categories.length === 0 ? <div className="muted">Crie uma categoria primeiro para configurar sugestões.</div> : categories.map((category) => <div key={category.id} className={styles.suggestionRow}>
        <Checkbox id={`suggestion-global-${category.id}`} name="categoryId" value={category.id} defaultChecked={category.selected} disabled={!category.active} label={`${category.name}${category.suggestedDefault ? " · sugestão padrão" : ""}${!category.active ? " · inativa" : ""}`} />
        <QuantityInput id={`suggestion-global-order-${category.id}`} label="Ordem" name={`order_${category.id}`} min={0} max={10000} defaultValue={category.sortOrder} />
      </div>)}
      <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Categorias inativas ou sem produtos disponíveis não aparecem ao consumidor. Desmarcar uma categoria não apaga produtos nem histórico.</p>
      <Button type="submit" disabled={categories.length === 0}>Salvar sugestões gerais</Button>
    </ResilientMutationForm>
    </details>
  </section>;
}
