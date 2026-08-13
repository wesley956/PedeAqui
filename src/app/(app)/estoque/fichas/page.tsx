import Link from "next/link";
import { RecipeService } from "@/server/inventory/recipe-service";
import { formatQuantity, type InventoryBaseUnit } from "@/server/inventory/values";
import { RecipeVersionForm } from "@/features/inventory/recipe-form";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export default async function RecipesPage() {
  const data = await RecipeService.load();
  const latestByTarget = new Set<string>();
  const recipes = data.recipes.map((recipe) => {
    const targetId = recipe.product_id ?? recipe.modifier_id ?? recipe.id;
    const key = `${recipe.target_type}:${targetId}`;
    const latest = !latestByTarget.has(key);
    latestByTarget.add(key);
    return { ...recipe, latest };
  });

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1180 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end", flexWrap: "wrap" }}>
        <div><p className="muted" style={{ margin: 0 }}>Composição e custo</p><h1 style={{ margin: "3px 0" }}>Fichas técnicas</h1><p className="muted" style={{ margin: 0, maxWidth: 760 }}>Cada alteração cria uma nova versão. Na baixa automática, o pedido usa a versão vigente quando foi confirmado — nunca a receita atual “de hoje”.</p></div>
        <Link href="/estoque" className="muted">← Voltar ao estoque</Link>
      </header>

      {data.canManage ? <article className="card" style={{ padding: 18, display: "grid", gap: 12 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Nova versão</h2><p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>Produtos e adicionais podem ter fichas independentes. Ex.: “Bacon adicional” também baixa o insumo quando selecionado.</p></div><RecipeVersionForm products={data.products} modifiers={data.modifiers} inventoryItems={data.inventoryItems} /></article> : null}

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><h2 style={{ margin: 0, fontSize: 18 }}>Histórico de versões</h2><span className="muted" style={{ fontSize: 12 }}>{recipes.length} versão(ões)</span></div>
        {recipes.length === 0 ? <article className="card" style={{ padding: 18 }}><p className="muted" style={{ margin: 0 }}>Nenhuma ficha técnica criada nesta unidade. Produtos sem ficha não geram consumo inventado; ficam sinalizados para configuração.</p></article> : recipes.map((recipe) => (
          <article key={recipe.id} className="card" style={{ padding: 16, display: "grid", gap: 10, border: recipe.latest ? "1px solid var(--accent)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div><strong style={{ fontSize: 17 }}>{recipe.targetName}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{recipe.target_type === "product" ? "Produto" : "Adicional"} · versão {recipe.version} · vigência {new Date(recipe.effective_at).toLocaleString("pt-BR")}{recipe.latest ? " · mais recente" : ""}</div></div>
              <div style={{ textAlign: "right" }}><span className="muted" style={{ fontSize: 10 }}>CUSTO ESTIMADO ATUAL</span><strong style={{ display: "block", color: "var(--accent)" }}>{money(recipe.estimatedCostCents)}</strong></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 7 }}>
              {recipe.items.map((item) => <div key={item.inventoryItemId} style={{ background: "var(--surface-2)", borderRadius: 10, padding: 10 }}><strong>{item.name}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{formatQuantity(item.quantity, item.baseUnit as InventoryBaseUnit)}</div></div>)}
            </div>
            {recipe.notes ? <div className="muted" style={{ fontSize: 12 }}>{recipe.notes}</div> : null}
            <div className="muted" style={{ fontSize: 10 }}>O custo exibido usa o custo médio atual dos insumos apenas para análise; a quantidade histórica da receita permanece imutável.</div>
          </article>
        ))}
      </div>
    </section>
  );
}
