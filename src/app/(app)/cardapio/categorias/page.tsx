import { Button } from "@/components/ui/button";
import { Checkbox, Input, QuantityInput } from "@/components/ui/form-controls";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { CategoryService } from "@/server/catalog/category-service";
import { createCategoryFormAction } from "@/features/catalog/actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { removeCategoryAction, updateCategoryFormAction } from "@/features/catalog/actions";
import styles from "../catalog-management.module.css";

export default async function CategoriesPage() {
  const categories = await CategoryService.list();

  return (
    <section className={styles.page}>
      <div className={styles.headerCopy}>
        <h1>Categorias</h1>
        <p className="muted">Organize a navegação do cardápio por ordem e disponibilidade.</p>
      </div>

      <ResilientMutationForm action={createCategoryFormAction} className={`card ${styles.formCard}`}>
        <h2>Nova categoria</h2>
        <div className={styles.formGrid}>
          <Input label="Nome" name="name" required maxLength={80} />
          <QuantityInput label="Ordem" name="sortOrder" min={0} defaultValue={0} />
        </div>
        <Input label="Descrição" name="description" maxLength={240} />
        <ImageUploadField name="imageFile" label="Imagem da categoria" />
        <Checkbox name="active" label="Categoria ativa" defaultChecked />
        <div><Button type="submit">Criar categoria</Button></div>
      </ResilientMutationForm>

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
              <span className="muted">{category.active ? "Ativa" : "Inativa"}</span>
            </div>
            <details className={styles.editDetails}>
              <summary>Editar categoria</summary>
              <ResilientMutationForm action={updateCategoryFormAction} successReset={false} className={styles.editBody}>
                <input type="hidden" name="categoryId" value={category.id} />
                <Input label="Nome" name="name" required maxLength={80} defaultValue={category.name} />
                <Input label="Descrição" name="description" maxLength={240} defaultValue={category.description ?? ""} />
                <QuantityInput label="Ordem" name="sortOrder" min={0} defaultValue={category.sort_order} />
                <ImageUploadField name="imageFile" label="Imagem da categoria" currentUrl={category.image_url} removeName="removeImage" />
                <Checkbox name="active" label="Categoria ativa" defaultChecked={category.active} />
                <div className={styles.managementActions}><Button type="submit">Salvar alterações</Button></div>
              </ResilientMutationForm>
            </details>
            <ResilientMutationForm action={removeCategoryAction}>
              <input type="hidden" name="categoryId" value={category.id} />
              <ConfirmSubmitButton confirmation="Remover esta categoria do catálogo? Produtos e histórico não serão apagados.">Remover categoria</ConfirmSubmitButton>
            </ResilientMutationForm>
          </article>
        ))}
      </div>
    </section>
  );
}
