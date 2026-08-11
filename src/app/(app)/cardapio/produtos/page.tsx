import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProductService } from "@/server/catalog/product-service";
import { formatCents } from "@/server/catalog/money";
import { duplicateProductAction, setProductAvailabilityAction } from "@/features/catalog/actions";

const labels = {
  available: "Disponível",
  sold_out: "Esgotado",
  inactive: "Inativo",
} as const;

export default async function ProductsPage() {
  const products = await ProductService.list();

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Produtos</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Catálogo da unidade ativa.</p>
        </div>
        <Link href="/cardapio/produtos/novo" style={{ fontWeight: 800 }}>+ Novo produto</Link>
      </header>

      {products.length === 0 ? (
        <article className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Nenhum produto cadastrado</h2>
          <p className="muted">Cadastre o primeiro item para começar a montar o cardápio.</p>
          <Link href="/cardapio/produtos/novo">Adicionar primeiro produto</Link>
        </article>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {products.map((product) => (
            <article key={product.id} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <strong style={{ fontSize: 17 }}>{product.name}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>{product.sku ? `SKU ${product.sku}` : "Sem SKU"}</div>
                </div>
                <strong>{formatCents(product.promotional_price_cents ?? product.price_cents)}</strong>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="muted">Status: {labels[product.availability as keyof typeof labels] ?? product.availability}</span>
                <form action={setProductAvailabilityAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="availability" value={product.availability === "available" ? "sold_out" : "available"} />
                  <Button type="submit" tone="secondary">{product.availability === "available" ? "Marcar esgotado" : "Marcar disponível"}</Button>
                </form>
                <form action={duplicateProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <Button type="submit" tone="secondary">Duplicar</Button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
