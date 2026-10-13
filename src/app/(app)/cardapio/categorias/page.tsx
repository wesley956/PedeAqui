import { Button } from "@/components/ui/button";
import { Checkbox, Input, QuantityInput } from "@/components/ui/form-controls";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { CategoryService } from "@/server/catalog/category-service";
import { createCategoryFormAction } from "@/features/catalog/actions";
import { duplicateCategoryFormAction } from "@/features/catalog/category-duplication-actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { removeCategoryAction, setCategoryActiveFormAction, updateCategoryFormAction } from "@/features/catalog/actions";
import styles from "../catalog-management.module.css";

export default async function CategoriesPage() {
  const categories = await CategoryService.list();

  return (
    <section className={styles.page}>
      <div className={styles.headerCopy}>
        <h1>Categorias</h1>
        <p className="muted">Organize a navegação do cardápio por ordem e disponibilidade.</p>
      </div>

      <details className={styles.createDetails}>
        <summary>Nova categoria</summary>
      <ResilientMutationForm action={createCategoryFormAction} className={styles.editBody}>
        <p className={styles.formHint}>Nome e ordem definem como a categoria aparece no cardápio.</p>
        <div className={styles.formGrid}>
          <Input id="new-category-name" label="Nome" name="name" required maxLength={80} />
          <QuantityInput id="new-category-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
        </div>
        <Input id="new-category-description" label="Descrição" name="description" maxLength={240} />
        <ImageUploadField name="imageFile" label="Imagem da categoria" />
        <Checkbox id="new-category-active" name="active" label="Categoria ativa" defaultChecked />
        <div><Button type="submit">Criar categoria</Button></div>
      </ResilientMutationForm>
      </details>

      <div className={styles.managementList}>
        {categories.length === 0 ? (
          <article className={`card ${styles.empty}`}><span className="muted">Nenhuma categoria cadastrada.</span></article>
        ) : categories.map((category) => (
          <article key={category.id} className={`card ${styles.managementCard}`}>
            <div className={styles.managementTop}>
              <div>
                <strong>{category.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>Ordem {category.sort_order}</div>
              </div>
              <span className={styles.stateBadge} data-active={category.active}>{category.active ? "Ativa" : "Pausada"}</span>
            </div>
            <ResilientMutationForm action={setCategoryActiveFormAction} className={styles.quickAvailabilityForm}>
              <input type="hidden" name="categoryId" value={category.id} />
              <input type="hidden" name="active" value={category.active ? "false" : "true"} />
              <Button type="submit" tone="secondary">{category.active ? "Pausar categoria" : "Reativar categoria"}</Button>
            </ResilientMutationForm>
            <details className={styles.editDetails}>
              <summary>Duplicar categoria</summary>
              <ResilientMutationForm action={duplicateCategoryFormAction} className={styles.editBody}>
                <input type="hidden" name="categoryId" value={category.id} />
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>A cópia será criada pausada para você revisar nome, preços e itens antes de publicar.</p>
                <Checkbox id={`category-${category.id}-include-products`} name="includeProducts" label="Incluir os produtos desta categoria e seus vínculos de adicionais" />
                <p className={styles.formHint}>Sugestões de venda, promoções e histórico não são copiados automaticamente.</p>
                <div className={styles.managementActions}><Button type="submit" tone="secondary">Criar cópia</Button></div>
              </ResilientMutationForm>
            </details>
            <details className={styles.editDetails}>
              <summary>Editar categoria</summary>
              <ResilientMutationForm action={updateCategoryFormAction} successReset={false} className={styles.editBody}>
                <input type="hidden" name="categoryId" value={category.id} />
                <Input id={`category-${category.id}-name`} label="Nome" name="name" required maxLength={80} defaultValue={category.name} />
                <Input id={`category-${category.id}-description`} label="Descrição" name="description" maxLength={240} defaultValue={category.description ?? ""} />
                <QuantityInput id={`category-${category.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={category.sort_order} />
                <ImageUploadField name="imageFile" label="Imagem da categoria" currentUrl={category.image_url} removeName="removeImage" />
                <Checkbox id={`category-${category.id}-active`} name="active" label="Categoria ativa" defaultChecked={category.active} />
                <div className={styles.managementActions}><Button type="submit">Salvar categoria</Button></div>
              </ResilientMutationForm>
            </details>
            <details className={styles.editDetails}>
              <summary>Remover categoria</summary>
            <ResilientMutationForm action={removeCategoryAction} className={styles.editBody}>
              <input type="hidden" name="categoryId" value={category.id} />
              <ConfirmSubmitButton confirmation="Remover esta categoria do catálogo? Produtos e histórico não serão apagados.">Remover categoria</ConfirmSubmitButton>
            </ResilientMutationForm>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
