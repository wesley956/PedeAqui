import { Button } from "@/components/ui/button";
import { Checkbox, QuantityInput } from "@/components/ui/form-controls";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { saveComplementCategoriesAction } from "@/features/menu/complement-actions";
import { ComplementCategoryService } from "@/server/menu/complement-category-service";
import styles from "../catalog-management.module.css";

export default async function ComplementSettingsPage() {
  const { businessType, categories } = await ComplementCategoryService.loadAdminSettings();
  const restaurant = businessType === "restaurant";
  return <section className={styles.page}>
    <header className={styles.headerCopy}><h1>Sugestões durante o pedido</h1><p className="muted">Escolha categorias para aparecerem na montagem do produto. Elas são opcionais para o cliente e não alteram módulos, planos ou permissões.</p></header>
    <ResilientMutationForm action={saveComplementCategoriesAction} successReset={false} className={`card ${styles.formCard}`}>
      <div><strong>Categorias para sugerir</strong><p className="muted" style={{ marginBottom: 0 }}>{restaurant ? "Para restaurantes, Bebidas é sugerida inicialmente quando existe uma correspondência única e segura. Você pode trocar ou remover." : "Nada é ativado automaticamente para este perfil. Escolha somente o que fizer sentido para a operação."}</p></div>
      {categories.length === 0 ? <div className="muted">Crie uma categoria primeiro para configurar sugestões.</div> : categories.map((category) => <div key={category.id} className={styles.suggestionRow}>
        <Checkbox name="categoryId" value={category.id} defaultChecked={category.selected} disabled={!category.active} label={`${category.name}${category.suggestedDefault ? " · sugestão padrão" : ""}${!category.active ? " · inativa" : ""}`} />
        <QuantityInput label="Ordem" name={`order_${category.id}`} min={0} max={10000} defaultValue={category.sortOrder} />
      </div>)}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Categorias inativas ou sem produtos disponíveis não aparecem ao consumidor. Desmarcar uma categoria não apaga produtos nem histórico.</p>
      <Button type="submit" disabled={categories.length === 0}>Salvar sugestões</Button>
    </ResilientMutationForm>
  </section>;
}
