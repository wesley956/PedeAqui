import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Checkbox,
  Input,
  MoneyInput,
  QuantityInput,
  SelectField,
  Textarea,
} from "@/components/ui/form-controls";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { CategoryService } from "@/server/catalog/category-service";
import { ModifierService } from "@/server/catalog/modifier-service";
import { createProductFormAction } from "@/features/catalog/actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import styles from "./product-editor.module.css";

export default async function NewProductPage() {
  const [categories, groups] = await Promise.all([CategoryService.list(), ModifierService.listGroups()]);

  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <Link href="/cardapio/produtos" className={styles.back}>← Voltar para produtos</Link>
        <h2>Novo produto</h2>
        <p className="muted">Preencha primeiro o essencial. Dados técnicos ficam recolhidos para não atrapalhar o cadastro comum.</p>
      </div>

      <ResilientMutationForm action={createProductFormAction} className={styles.form}>
        <section className={`card ${styles.section}`} aria-labelledby="produto-basico">
          <div className={styles.sectionHeader}>
            <h2 id="produto-basico">Informações básicas</h2>
            <p className="muted">Nome, descrição e categoria são o que o cliente reconhece primeiro.</p>
          </div>
          <Input label="Nome" name="name" required maxLength={120} autoFocus />
          <Textarea label="Descrição" name="description" rows={3} maxLength={1000} />
          <SelectField label="Categoria" name="categoryId" defaultValue="">
            <option value="">Sem categoria</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </SelectField>
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="produto-preco">
          <div className={styles.sectionHeader}>
            <h2 id="produto-preco">Preço</h2>
            <p className="muted">O preço de venda é obrigatório. Promoção só precisa ser preenchida quando houver.</p>
          </div>
          <div className={styles.grid2}>
            <MoneyInput label="Preço" name="price" placeholder="29,90" required />
            <MoneyInput label="Preço promocional" name="promotionalPrice" placeholder="24,90" />
          </div>
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="produto-imagem">
          <div className={styles.sectionHeader}>
            <h2 id="produto-imagem">Imagem</h2>
            <p className="muted">Escolha uma foto clara do produto. Você também pode salvar o item sem imagem.</p>
          </div>
          <ImageUploadField name="imageFile" label="Foto do produto" />
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="produto-disponibilidade">
          <div className={styles.sectionHeader}>
            <h2 id="produto-disponibilidade">Disponibilidade</h2>
            <p className="muted">Defina como o item deve entrar no catálogo. Depois, a disponibilidade pode ser alterada diretamente na lista de produtos.</p>
          </div>
          <SelectField label="Situação" name="availability" defaultValue="available" hint="Esgotado aparece no cardápio, mas não pode ser pedido. Oculto não aparece.">
            <option value="available">À venda</option>
            <option value="sold_out">Esgotado</option>
            <option value="inactive">Oculto do cardápio</option>
          </SelectField>
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="produto-adicionais">
          <div className={styles.sectionHeader}>
            <h2 id="produto-adicionais">Escolhas do cliente</h2>
            <p className="muted">Marque os grupos que o cliente escolhe neste produto (sabores, tamanhos, adicionais). A ordem segue a da lista.</p>
          </div>
          {groups.length === 0 ? (
            <div className={styles.helperCard}>
              <strong>Nenhum grupo de escolhas criado ainda.</strong>
              <p>Crie grupos como “Escolha os sabores” e depois vincule a este produto.</p>
              <Link href="/cardapio/adicionais">Criar sabores e adicionais</Link>
            </div>
          ) : (
            <div className={styles.choiceList}>
              {groups.map((group) => <Checkbox key={group.id} id={`new-product-group-${group.id}`} name="modifierGroupIds" value={group.id} label={group.name} hint={group.required ? "Obrigatório" : "Opcional"} />)}
            </div>
          )}
        </section>

        <details className={styles.details}>
          <summary>Dados avançados e operacionais</summary>
          <div className={styles.detailsBody}>
            <p className="muted">Preencha apenas quando fizer parte da rotina do estabelecimento.</p>
            <div className={styles.grid2}>
              <MoneyInput label="Custo" name="cost" placeholder="12,50" />
              <QuantityInput label="Preparo (min)" name="preparationTimeMinutes" min={0} max={1440} defaultValue={0} />
              <QuantityInput label="Ordem no cardápio" name="sortOrder" min={0} max={10000} defaultValue={0} />
            </div>
            <div className={styles.grid2}>
              <Input label="SKU" name="sku" maxLength={64} />
              <Input label="Código de barras" name="barcode" maxLength={64} />
            </div>
          </div>
        </details>

        <div className={styles.actions}>
          <Link href="/cardapio/produtos">Cancelar</Link>
          <Button type="submit">Salvar produto</Button>
        </div>
      </ResilientMutationForm>
    </section>
  );
}
