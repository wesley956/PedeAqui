import { Button } from "@/components/ui/button";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { saveComplementCategoriesAction } from "@/features/menu/complement-actions";
import { ComplementCategoryService } from "@/server/menu/complement-category-service";

export default async function ComplementSettingsPage() {
  const { businessType, categories } = await ComplementCategoryService.loadAdminSettings();
  const restaurant = businessType === "restaurant";
  return <section style={{ display: "grid", gap: 18 }}>
    <header><h1 style={{ margin: 0 }}>Sugestões durante o pedido</h1><p className="muted">Escolha categorias para aparecerem na montagem do produto. Elas são opcionais para o cliente e não alteram módulos, planos ou permissões.</p></header>
    <ResilientMutationForm action={saveComplementCategoriesAction} successReset={false} className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
      <div><strong>Categorias para sugerir</strong><p className="muted" style={{ marginBottom: 0 }}>{restaurant ? "Para restaurantes, Bebidas é sugerida inicialmente quando existe uma correspondência única e segura. Você pode trocar ou remover." : "Nada é ativado automaticamente para este perfil. Escolha somente o que fizer sentido para a operação."}</p></div>
      {categories.length === 0 ? <div className="muted">Crie uma categoria primeiro para configurar sugestões.</div> : categories.map((category) => <label key={category.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px", gap: 12, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" name="categoryId" value={category.id} defaultChecked={category.selected} disabled={!category.active} /><span><strong>{category.name}</strong>{category.suggestedDefault ? <span className="muted"> · sugestão padrão</span> : null}{!category.active ? <span className="muted"> · inativa</span> : null}</span></span>
        <span style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 12 }}>Ordem</span><input name={`order_${category.id}`} type="number" min={0} max={10000} defaultValue={category.sortOrder} style={{ width: "100%", minHeight: 40, border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-2)", color: "var(--text)" }} /></span>
      </label>)}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Categorias inativas ou sem produtos disponíveis não aparecem ao consumidor. Desmarcar uma categoria não apaga produtos nem histórico.</p>
      <Button type="submit" disabled={categories.length === 0}>Salvar sugestões</Button>
    </ResilientMutationForm>
  </section>;
}
