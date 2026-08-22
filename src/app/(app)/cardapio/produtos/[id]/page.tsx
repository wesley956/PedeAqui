import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, MoneyInput, QuantityInput, SelectField, Textarea } from "@/components/ui/form-controls";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { linkModifierGroupAction, unlinkModifierGroupAction, updateProductFormAction } from "@/features/catalog/actions";
import { CategoryService } from "@/server/catalog/category-service";
import { ModifierService } from "@/server/catalog/modifier-service";
import { ProductService } from "@/server/catalog/product-service";
import styles from "../novo/product-editor.module.css";

function moneyValue(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, modifierGroups, modifierGroupLinks] = await Promise.all([
    ProductService.get(id),
    CategoryService.list(),
    ModifierService.listGroups(),
    ModifierService.listProductGroupLinks(id),
  ]);
  const linkedGroups = modifierGroupLinks.map((link) => ({
    ...link,
    group: modifierGroups.find((group) => group.id === link.modifier_group_id),
  }));

  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <Link href="/cardapio/produtos" className={styles.back}>← Voltar para produtos</Link>
        <h1>Editar produto</h1>
        <p className="muted">Atualize cadastro, preço, promoção, foto e disponibilidade sem perder o histórico.</p>
      </div>

      <ResilientMutationForm action={updateProductFormAction} successReset={false} className={styles.form}>
        <input type="hidden" name="productId" value={product.id} />

        <section className={`card ${styles.section}`}>
          <h2 style={{ marginTop: 0 }}>Informações básicas</h2>
          <Input label="Nome" name="name" required maxLength={120} defaultValue={product.name} />
          <Textarea label="Descrição" name="description" rows={3} maxLength={1000} defaultValue={product.description ?? ""} />
          <SelectField label="Categoria" name="categoryId" defaultValue={product.category_id ?? ""}>
            <option value="">Sem categoria</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </SelectField>
        </section>

        <section className={`card ${styles.section}`}>
          <h2 style={{ marginTop: 0 }}>Preço e promoção</h2>
          <div className={styles.grid2}>
            <MoneyInput label="Preço" name="price" required defaultValue={moneyValue(product.price_cents)} />
            <MoneyInput label="Preço promocional" name="promotionalPrice" defaultValue={moneyValue(product.promotional_price_cents)} />
          </div>
        </section>

        <section className={`card ${styles.section}`}>
          <h2 style={{ marginTop: 0 }}>Imagem</h2>
          <ImageUploadField name="imageFile" label="Foto do produto" currentUrl={product.image_url} removeName="removeImage" />
          <p className="muted" style={{ marginBottom: 0 }}>Trocar ou remover afeta o catálogo atual. Pedidos antigos preservam seus snapshots.</p>
        </section>

        <section className={`card ${styles.section}`}>
          <h2 style={{ marginTop: 0 }}>Disponibilidade</h2>
          <SelectField label="Situação" name="availability" defaultValue={product.availability}>
            <option value="available">Disponível</option>
            <option value="sold_out">Esgotado</option>
            <option value="inactive">Inativo</option>
          </SelectField>
          <Checkbox label="Produto ativo no catálogo" name="active" defaultChecked={product.active} />
        </section>

        <details className={styles.details}>
          <summary>Dados avançados e operacionais</summary>
          <div className={styles.detailsBody}>
            <div className={styles.grid2}>
              <MoneyInput label="Custo" name="cost" defaultValue={moneyValue(product.cost_cents)} />
              <QuantityInput label="Preparo (min)" name="preparationTimeMinutes" min={0} max={1440} defaultValue={product.preparation_time_minutes} />
              <QuantityInput label="Ordem no cardápio" name="sortOrder" min={0} max={10000} defaultValue={product.sort_order} />
            </div>
            <div className={styles.grid2}>
              <Input label="SKU" name="sku" maxLength={64} defaultValue={product.sku ?? ""} />
              <Input label="Código de barras" name="barcode" maxLength={64} defaultValue={product.barcode ?? ""} />
            </div>
          </div>
        </details>

        <div className={styles.actions}>
          <Link href="/cardapio/produtos">Cancelar</Link>
          <Button type="submit" size="lg">Salvar alterações</Button>
        </div>
      </ResilientMutationForm>

      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <h2>Adicionais, tamanhos e sabores</h2>
          <p className="muted">Vincule um grupo ao produto e ajuste a ordem em que o cliente fará as escolhas.</p>
        </div>
        {modifierGroups.length === 0 ? (
          <div className={styles.helperCard}>
            <strong>Nenhum grupo disponível.</strong>
            <Link href="/cardapio/adicionais">Criar grupos e opções</Link>
          </div>
        ) : (
          <ResilientMutationForm action={linkModifierGroupAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="productId" value={product.id} />
            <SelectField label="Grupo" name="modifierGroupId" required>
              {modifierGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </SelectField>
            <QuantityInput label="Ordem" name="sortOrder" min={0} max={10000} defaultValue={0} />
            <Button type="submit">Vincular ou atualizar ordem</Button>
          </ResilientMutationForm>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {linkedGroups.length === 0 ? <span className="muted">Nenhum grupo vinculado.</span> : linkedGroups.map((link) => (
            <div key={link.modifier_group_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <span><strong>{link.group?.name ?? "Grupo indisponível"}</strong> <span className="muted">· ordem {link.sort_order}</span></span>
              <ResilientMutationForm action={unlinkModifierGroupAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="modifierGroupId" value={link.modifier_group_id} />
                <ConfirmSubmitButton confirmation="Desvincular este grupo do produto? O grupo continuará disponível para outros produtos.">Desvincular</ConfirmSubmitButton>
              </ResilientMutationForm>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
