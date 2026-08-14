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
import { CategoryService } from "@/server/catalog/category-service";
import { createProductAction } from "@/features/catalog/actions";
import styles from "./product-editor.module.css";

export default async function NewProductPage() {
  const categories = await CategoryService.list();

  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <Link href="/cardapio/produtos" className={styles.back}>← Voltar para produtos</Link>
        <h1>Novo produto</h1>
        <p className="muted">Preencha primeiro o essencial. Dados técnicos ficam recolhidos para não atrapalhar o cadastro comum.</p>
      </div>

      <form action={createProductAction} className={styles.form}>
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
            <p className="muted">Uma imagem clara ajuda o cliente a escolher. O produto pode ser salvo sem ela.</p>
          </div>
          <Input label="URL da imagem" name="imageUrl" type="url" hint="O upload direto será ativado quando o storage do ambiente estiver provisionado." />
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="produto-disponibilidade">
          <div className={styles.sectionHeader}>
            <h2 id="produto-disponibilidade">Disponibilidade</h2>
            <p className="muted">Defina como o item deve entrar no catálogo. Depois, a disponibilidade pode ser alterada diretamente na lista de produtos.</p>
          </div>
          <SelectField label="Disponibilidade inicial" name="availability" defaultValue="available">
            <option value="available">Disponível</option>
            <option value="sold_out">Esgotado</option>
            <option value="inactive">Inativo</option>
          </SelectField>
          <Checkbox label="Produto ativo no catálogo" name="active" defaultChecked hint="Desative somente quando o item não deve participar da operação." />
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="produto-adicionais">
          <div className={styles.sectionHeader}>
            <h2 id="produto-adicionais">Adicionais e opções</h2>
            <p className="muted">Grupos de adicionais são compartilhados entre produtos e continuam sendo administrados na área própria.</p>
          </div>
          <div className={styles.helperCard}>
            <strong>Vincule adicionais depois de salvar o produto.</strong>
            <p>Isso evita interromper o cadastro básico e mantém as regras existentes de grupos e opções.</p>
            <Link href="/cardapio/adicionais">Abrir gestão de adicionais</Link>
          </div>
        </section>

        <details className={styles.details}>
          <summary>Dados avançados e operacionais</summary>
          <div className={styles.detailsBody}>
            <p className="muted">Preencha apenas quando fizer parte da rotina do estabelecimento.</p>
            <div className={styles.grid2}>
              <MoneyInput label="Custo" name="cost" placeholder="12,50" />
              <QuantityInput label="Preparo (min)" name="preparationTimeMinutes" min={0} max={1440} defaultValue={0} />
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
      </form>
    </section>
  );
}
