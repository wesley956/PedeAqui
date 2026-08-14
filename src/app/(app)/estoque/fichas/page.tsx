import Link from "next/link";
import { SemanticStatus } from "@/components/ui/status";
import { RecipeService } from "@/server/inventory/recipe-service";
import { formatQuantity, type InventoryBaseUnit } from "@/server/inventory/values";
import { RecipeVersionForm } from "@/features/inventory/recipe-form";
import styles from "../inventory-operations.module.css";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export default async function RecipesPage() {
  const data = await RecipeService.load();
  const latestByTarget = new Set<string>();
  const recipes = data.recipes.map((recipe) => { const targetId = recipe.product_id ?? recipe.modifier_id ?? recipe.id; const key = `${recipe.target_type}:${targetId}`; const latest = !latestByTarget.has(key); latestByTarget.add(key); return { ...recipe, latest }; });
  const activeRecipes = recipes.filter((recipe) => recipe.latest).length;

  return <section className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerCopy}><p className="muted">Composição, versão e custo</p><h1>Fichas técnicas</h1><p className="muted">Cada alteração cria uma nova versão. O histórico é somente leitura e o pedido conserva a versão vigente quando foi confirmado.</p></div>
      <Link href="/estoque" className={styles.link}>← Voltar ao estoque</Link>
    </header>

    <div className={styles.metrics}>
      <Metric label="Fichas ativas" value={activeRecipes} />
      <Metric label="Versões históricas" value={Math.max(0, recipes.length - activeRecipes)} />
      <Metric label="Total de versões" value={recipes.length} />
      <Metric label="Insumos disponíveis" value={data.inventoryItems.length} />
    </div>

    {data.canManage ? <article className={`card ${styles.asideCard}`}><div><h2>Nova versão</h2><p className="muted">Crie uma versão nova para alterar composição. Versões anteriores não são editadas.</p></div><RecipeVersionForm products={data.products} modifiers={data.modifiers} inventoryItems={data.inventoryItems} /></article> : null}

    <div className={styles.recipeGrid}>
      <div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>Versões</h2><span className="muted">Mais recente destacada por item</span></div>
      {recipes.length === 0 ? <article className={`card ${styles.asideCard}`}><p className="muted">Nenhuma ficha técnica criada nesta unidade. Produtos sem ficha não geram consumo inventado.</p></article> : recipes.map((recipe) => <article key={recipe.id} className={`card ${styles.recipeCard} ${recipe.latest ? styles.recipeLatest : ""}`}>
        <div className={styles.recipeTop}>
          <div className={styles.recipeTarget}><strong className={styles.itemName}>{recipe.targetName}</strong><span className={styles.itemMeta}>{recipe.target_type === "product" ? "Produto" : "Adicional"} · versão {recipe.version} · vigência {new Date(recipe.effective_at).toLocaleString("pt-BR")}</span>{recipe.latest ? <SemanticStatus tone="success" icon="✓" label="Versão ativa" /> : <SemanticStatus tone="neutral" icon="○" label="Histórico" />}</div>
          <div className={styles.recipeCost}><span className={styles.metricLabel}>Custo estimado atual</span><strong className={styles.costValue}>{money(recipe.estimatedCostCents)}</strong></div>
        </div>
        <div className={styles.ingredients}>{recipe.items.map((item) => <div key={item.inventoryItemId} className={styles.ingredient}><strong>{item.name}</strong><span className={styles.itemMeta}>{formatQuantity(item.quantity, item.baseUnit as InventoryBaseUnit)}</span></div>)}</div>
        {recipe.notes ? <div className="muted">{recipe.notes}</div> : null}
        <div className={styles.historyNote}>O custo exibido usa o custo médio atual somente para análise. Quantidades e versão histórica permanecem imutáveis.</div>
      </article>)}
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className={`card ${styles.metric}`}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong></div>; }
