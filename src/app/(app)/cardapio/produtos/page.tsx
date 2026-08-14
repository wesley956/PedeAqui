import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchInput, SelectField } from "@/components/ui/form-controls";
import { SemanticStatus } from "@/components/ui/status";
import { ProductService } from "@/server/catalog/product-service";
import { CategoryService } from "@/server/catalog/category-service";
import { formatCents } from "@/server/catalog/money";
import { duplicateProductAction, setProductAvailabilityAction } from "@/features/catalog/actions";
import styles from "../catalog-management.module.css";

const labels = {
  available: "Disponível",
  sold_out: "Esgotado",
  inactive: "Inativo",
} as const;

const statusPresentation = {
  available: { tone: "success", icon: "✓" },
  sold_out: { tone: "warning", icon: "!" },
  inactive: { tone: "neutral", icon: "○" },
} as const;

type ProductsPageProps = {
  searchParams: Promise<{ q?: string; status?: string; category?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const [products, categories, params] = await Promise.all([
    ProductService.list(),
    CategoryService.list(),
    searchParams,
  ]);

  const query = (params.q ?? "").trim().toLocaleLowerCase("pt-BR");
  const status = params.status ?? "all";
  const category = params.category ?? "all";
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));

  const filteredProducts = products.filter((product) => {
    const searchable = `${product.name} ${product.description ?? ""} ${product.sku ?? ""}`.toLocaleLowerCase("pt-BR");
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus = status === "all" || product.availability === status;
    const matchesCategory = category === "all" || product.category_id === category;
    return matchesQuery && matchesStatus && matchesCategory;
  });

  const availableCount = products.filter((item) => item.availability === "available").length;
  const soldOutCount = products.filter((item) => item.availability === "sold_out").length;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1>Produtos</h1>
          <p className="muted">Encontre itens rapidamente e altere a disponibilidade sem abrir o cadastro completo.</p>
        </div>
        <Link href="/cardapio/produtos/novo" className={styles.primaryLink}>Novo produto</Link>
      </header>

      <form className={`card ${styles.filters}`} method="get" aria-label="Filtros do catálogo">
        <SearchInput label="Buscar" name="q" defaultValue={params.q ?? ""} placeholder="Nome, descrição ou SKU" />
        <SelectField label="Disponibilidade" name="status" defaultValue={status}>
          <option value="all">Todas</option>
          <option value="available">Disponíveis</option>
          <option value="sold_out">Esgotados</option>
          <option value="inactive">Inativos</option>
        </SelectField>
        <SelectField label="Categoria" name="category" defaultValue={category}>
          <option value="all">Todas as categorias</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
        <div className={styles.filterActions}>
          <Button type="submit">Filtrar</Button>
          <Link href="/cardapio/produtos">Limpar</Link>
        </div>
      </form>

      <div className={styles.summary} aria-label="Resumo do catálogo">
        <span><strong>{products.length}</strong> produtos</span>
        <span><strong>{availableCount}</strong> disponíveis</span>
        <span><strong>{soldOutCount}</strong> esgotados</span>
        {filteredProducts.length !== products.length ? <span><strong>{filteredProducts.length}</strong> exibidos</span> : null}
      </div>

      {products.length === 0 ? (
        <article className={`card ${styles.empty}`}>
          <h2>Nenhum produto cadastrado</h2>
          <p className="muted">Cadastre o primeiro item para começar a montar o cardápio.</p>
          <Link href="/cardapio/produtos/novo">Adicionar primeiro produto</Link>
        </article>
      ) : filteredProducts.length === 0 ? (
        <article className={`card ${styles.empty}`}>
          <h2>Nenhum produto encontrado</h2>
          <p className="muted">Ajuste a busca ou os filtros sem perder o catálogo cadastrado.</p>
          <Link href="/cardapio/produtos">Limpar filtros</Link>
        </article>
      ) : (
        <div className={styles.productList}>
          {filteredProducts.map((product) => {
            const availability = product.availability as keyof typeof labels;
            const presentation = statusPresentation[availability] ?? statusPresentation.inactive;
            return (
              <article key={product.id} className={`card ${styles.productCard}`}>
                <div className={styles.productMain}>
                  <div className={styles.productTitleRow}>
                    <span className={styles.productName}>{product.name}</span>
                    <SemanticStatus tone={presentation.tone} icon={presentation.icon} label={labels[availability] ?? product.availability} />
                  </div>
                  {product.description ? <p className={styles.productDescription}>{product.description}</p> : null}
                  <div className={styles.productMeta}>
                    <span className={styles.metaChip}>{categoryNames.get(product.category_id ?? "") ?? "Sem categoria"}</span>
                    <span className={styles.metaChip}>{product.sku ? `SKU ${product.sku}` : "Sem SKU"}</span>
                    {product.image_url ? <span className={styles.metaChip}>Imagem cadastrada</span> : null}
                  </div>
                  <div className={styles.productActions}>
                    <form action={setProductAvailabilityAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="availability" value={product.availability === "available" ? "sold_out" : "available"} />
                      <Button type="submit" tone="secondary">
                        {product.availability === "available" ? "Marcar esgotado" : "Marcar disponível"}
                      </Button>
                    </form>
                    <form action={duplicateProductAction}>
                      <input type="hidden" name="productId" value={product.id} />
                      <Button type="submit" tone="secondary">Duplicar</Button>
                    </form>
                  </div>
                </div>
                <div className={styles.productPrice}>{formatCents(product.promotional_price_cents ?? product.price_cents)}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
