import { Button } from "@/components/ui/button";
import { Checkbox, Input, QuantityInput } from "@/components/ui/form-controls";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { CatalogRow, CatalogSectionHeader } from "@/features/catalog/catalog-list";
import { CatalogSwitch } from "@/features/catalog/catalog-switch";
import { CategoryService } from "@/server/catalog/category-service";
import { ProductService } from "@/server/catalog/product-service";
import { createCategoryFormAction } from "@/features/catalog/actions";
import { duplicateCategoryFormAction } from "@/features/catalog/category-duplication-actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { removeCategoryAction, setCategoryActiveFormAction, updateCategoryFormAction } from "@/features/catalog/actions";
import styles from "../catalog-management.module.css";

export default async function CategoriesPage() {
  const [categories, products] = await Promise.all([CategoryService.list(), ProductService.list()]);
  const productCount = new Map<string, number>();
  for (const product of products) if (product.category_id) productCount.set(product.category_id, (productCount.get(product.category_id) ?? 0) + 1);
  const activeCount = categories.filter((category) => category.active).length;

  return (
    <section className={styles.page}>
      <CatalogSectionHeader
        title="Categorias"
        description="Organize a navegação do cardápio por ordem e disponibilidade."
        actions={[{
          id: "nova-categoria",
          label: "Nova categoria",
          content: (
            <ResilientMutationForm action={createCategoryFormAction} className={styles.editBody}>
              <p className={styles.formHint}>Nome e ordem definem como a categoria aparece no cardápio.</p>
              <div className={styles.formGrid}>
                <Input id="new-category-name" label="Nome" name="name" required maxLength={80} />
                <QuantityInput id="new-category-order" label="Ordem" name="sortOrder" min={0} defaultValue={0} />
              </div>
              <Input id="new-category-description" label="Descrição" name="description" maxLength={240} />
              <ImageUploadField name="imageFile" label="Imagem da categoria" />
              <Checkbox id="new-category-active" name="active" label="Categoria ativa" defaultChecked />
              <div className={styles.managementActions}><Button type="submit">Criar categoria</Button></div>
            </ResilientMutationForm>
          ),
        }]}
      />

      <div className={styles.summary} aria-label="Resumo das categorias">
        <span><strong>{categories.length}</strong> categorias</span>
        <span><strong>{activeCount}</strong> ativas</span>
      </div>

      {categories.length === 0 ? (
        <article className={`card ${styles.empty}`}>
          <h2>Nenhuma categoria cadastrada</h2>
          <p className="muted">Toque em Nova categoria para começar a organizar o cardápio.</p>
        </article>
      ) : (
        <div className={styles.productList} role="list" aria-label="Categorias do cardápio">
          {categories.map((category) => {
            const count = productCount.get(category.id) ?? 0;
            return (
              <CatalogRow
                key={category.id}
                main={<>
                  <div className={styles.productTitleRow}>
                    <span className={styles.productName}>{category.name}</span>
                    <span className={styles.stateBadge} data-active={category.active}>{category.active ? "Ativa" : "Pausada"}</span>
                  </div>
                  {category.description ? <p className={styles.productDescription}>{category.description}</p> : null}
                  <div className={styles.productMeta}>
                    <span className={styles.metaChip}>{count === 1 ? "1 produto" : `${count} produtos`}</span>
                    <span className={styles.metaChip}>Ordem {category.sort_order}</span>
                    {category.image_url ? <span className={styles.metaChip}>Imagem cadastrada</span> : null}
                  </div>
                </>}
                toggle={<CatalogSwitch
                  action={setCategoryActiveFormAction}
                  fields={{ categoryId: category.id, active: category.active ? "false" : "true" }}
                  on={category.active}
                  label="Ativa"
                  actionLabel={`${category.active ? "Pausar categoria" : "Reativar categoria"}: ${category.name}`}
                />}
                editLabel={`Editar categoria ${category.name}`}
                editor={
                  <ResilientMutationForm action={updateCategoryFormAction} successReset={false} className={styles.editBody}>
                    <input type="hidden" name="categoryId" value={category.id} />
                    <div className={styles.formGrid}>
                      <Input id={`category-${category.id}-name`} label="Nome" name="name" required maxLength={80} defaultValue={category.name} />
                      <QuantityInput id={`category-${category.id}-order`} label="Ordem" name="sortOrder" min={0} defaultValue={category.sort_order} />
                    </div>
                    <Input id={`category-${category.id}-description`} label="Descrição" name="description" maxLength={240} defaultValue={category.description ?? ""} />
                    <ImageUploadField name="imageFile" label="Imagem da categoria" currentUrl={category.image_url} removeName="removeImage" />
                    <Checkbox id={`category-${category.id}-active`} name="active" label="Categoria ativa" defaultChecked={category.active} />
                    <div className={styles.managementActions}><Button type="submit">Salvar categoria</Button></div>
                  </ResilientMutationForm>
                }
                menuLabel={`Ações da categoria ${category.name}`}
                menu={<>
                  <ResilientMutationForm action={duplicateCategoryFormAction} className={styles.menuForm}>
                    <input type="hidden" name="categoryId" value={category.id} />
                    <strong>Duplicar categoria</strong>
                    <p className={styles.formHint}>A cópia será criada pausada para você revisar nome, preços e itens antes de publicar.</p>
                    <Checkbox id={`category-${category.id}-include-products`} name="includeProducts" label="Incluir os produtos desta categoria e seus vínculos de adicionais" />
                    <p className={styles.formHint}>Sugestões de venda, promoções e histórico não são copiados automaticamente.</p>
                    <Button type="submit" tone="secondary">Criar cópia</Button>
                  </ResilientMutationForm>
                  <ResilientMutationForm action={removeCategoryAction} className={styles.menuForm}>
                    <input type="hidden" name="categoryId" value={category.id} />
                    <ConfirmSubmitButton tone="secondary" confirmation="Remover esta categoria do catálogo? Produtos e histórico não serão apagados.">Remover categoria</ConfirmSubmitButton>
                  </ResilientMutationForm>
                </>}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
