import { Button } from "@/components/ui/button";
import { Checkbox, QuantityInput } from "@/components/ui/form-controls";
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
    <header className={styles.headerCopy}><h1>Sugestões durante o pedido</h1><p className="muted">Configure o que aparece como complemento durante a montagem do produto. Regras específicas por categoria têm prioridade; quando uma categoria não possui regra própria, o PedeAqui usa as sugestões globais.</p></header>

    <div className={`card ${styles.formCard}`}>
      <div><strong>1. Regra específica por categoria</strong><p className="muted" style={{ marginBottom: 0 }}>Use esta área para criar sequências como <strong>Salgados → Churros → Bebidas</strong>, definir a ordem e trocar o título exibido ao cliente, por exemplo “Vai um docinho?”.</p></div>
      {activeCategories.length === 0 ? <div className="muted">Crie e ative pelo menos uma categoria antes de configurar regras específicas.</div> : <>
        <form method="get" style={{ display: "grid", gap: 8, maxWidth: 520 }}>
          <label htmlFor="source-category" style={{ fontWeight: 700 }}>Quando o cliente estiver comprando um item de</label>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
            <select id="source-category" name="source" defaultValue={sourceCategory?.id} style={{ minHeight: 44, borderRadius: 10, border: "var(--border-width) solid var(--border-default)", background: "var(--surface-2)", color: "var(--text-primary)", padding: "8px 10px" }}>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <Button type="submit">Carregar</Button>
          </div>
        </form>

        {sourceCategory ? <ResilientMutationForm action={saveComplementCategoryRulesAction} successReset={false} className={styles.formCard}>
          <input type="hidden" name="sourceCategoryId" value={sourceCategory.id} />
          <div><strong>Sugerir depois de {sourceCategory.name}</strong><p className="muted" style={{ marginBottom: 0 }}>Marque as categorias desejadas. Ordem menor aparece primeiro. O título é opcional; vazio mantém o texto padrão.</p></div>
          {categories.filter((category) => category.id !== sourceCategory.id).map((category) => {
            const rule = sourceRuleMap.get(category.id);
            return <div key={category.id} className={styles.suggestionRow} style={{ alignItems: "end" }}>
              <Checkbox name="targetCategoryId" value={category.id} defaultChecked={Boolean(rule)} disabled={!category.active} label={`${category.name}${!category.active ? " · inativa" : ""}`} />
              <label style={{ display: "grid", gap: 6, minWidth: 180 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Título para o cliente</span>
                <input name={`rule_title_${category.id}`} maxLength={80} defaultValue={rule?.title ?? ""} placeholder={category.name === "Churros" ? "Ex.: Vai um docinho?" : "Opcional"} disabled={!category.active} style={{ minHeight: 42, borderRadius: 10, border: "var(--border-width) solid var(--border-default)", background: "var(--surface-2)", color: "var(--text-primary)", padding: "8px 10px" }} />
              </label>
              <QuantityInput label="Ordem" name={`rule_order_${category.id}`} min={0} max={10000} defaultValue={rule?.sortOrder ?? category.sortOrder} />
            </div>;
          })}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{sourceRules.length > 0 ? `${sourceRules.length} categoria(s) configurada(s) especificamente para ${sourceCategory.name}.` : `Nenhuma regra específica para ${sourceCategory.name}; hoje ela herda a configuração global abaixo.`}</p>
          <Button type="submit">Salvar regra de {sourceCategory.name}</Button>
        </ResilientMutationForm> : null}
      </>}
    </div>

    <ResilientMutationForm action={saveComplementCategoriesAction} successReset={false} className={`card ${styles.formCard}`}>
      <div><strong>2. Sugestões globais (fallback)</strong><p className="muted" style={{ marginBottom: 0 }}>{restaurant ? "Estas sugestões valem quando a categoria de origem não possui regra específica. Para restaurantes, Bebidas é sugerida inicialmente quando existe uma correspondência única e segura." : "Estas sugestões valem quando a categoria de origem não possui regra específica. Nada é ativado automaticamente para este perfil."}</p></div>
      {categories.length === 0 ? <div className="muted">Crie uma categoria primeiro para configurar sugestões.</div> : categories.map((category) => <div key={category.id} className={styles.suggestionRow}>
        <Checkbox name="categoryId" value={category.id} defaultChecked={category.selected} disabled={!category.active} label={`${category.name}${category.suggestedDefault ? " · sugestão padrão" : ""}${!category.active ? " · inativa" : ""}`} />
        <QuantityInput label="Ordem" name={`order_${category.id}`} min={0} max={10000} defaultValue={category.sortOrder} />
      </div>)}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Categorias inativas ou sem produtos disponíveis não aparecem ao consumidor. Desmarcar uma categoria não apaga produtos nem histórico.</p>
      <Button type="submit" disabled={categories.length === 0}>Salvar sugestões globais</Button>
    </ResilientMutationForm>
  </section>;
}
