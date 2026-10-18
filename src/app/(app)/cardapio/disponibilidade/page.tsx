import { CategoryService } from "@/server/catalog/category-service";
import { ModifierService } from "@/server/catalog/modifier-service";
import { ProductService } from "@/server/catalog/product-service";
import { formatCents } from "@/server/catalog/money";
import { normalizedCatalogName } from "@/server/catalog/catalog-name";
import { AvailabilityBoard, type AvailabilityEntry } from "./availability-board";

type AvailabilityPageProps = {
  searchParams: Promise<{ q?: string; buscar?: string; filtro?: string }>;
};

/**
 * "O que está à venda agora": uma busca só para produtos e sabores/adicionais.
 * Sabores com o mesmo nome em vários grupos viram uma linha só, com um interruptor que vale para todos.
 */
export default async function AvailabilityPage({ searchParams }: AvailabilityPageProps) {
  const [products, categories, groups, modifiers, links, params] = await Promise.all([
    ProductService.list(),
    CategoryService.list(),
    ModifierService.listGroups(),
    ModifierService.listModifiers(),
    ModifierService.listAllProductGroupLinks(),
    searchParams,
  ]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const productsByGroup = new Map<string, Set<string>>();
  for (const link of links) {
    const set = productsByGroup.get(link.modifier_group_id) ?? new Set<string>();
    set.add(link.product_id);
    productsByGroup.set(link.modifier_group_id, set);
  }

  const productEntries: AvailabilityEntry[] = products.map((product): AvailabilityEntry => {
    const state = product.availability === "available" ? "on" : "off";
    const statusLabel = product.availability === "available" ? "À venda" : product.availability === "sold_out" ? "Esgotado" : "Oculto";
    const category = categoryNames.get(product.category_id ?? "") ?? "Sem categoria";
    return {
      kind: "product",
      id: product.id,
      name: product.name,
      detail: `Produto · ${category} · ${formatCents(product.promotional_price_cents ?? product.price_cents)}`,
      state,
      statusLabel,
      searchText: normalizedCatalogName(`${product.name} ${category} ${product.sku ?? ""}`),
    };
  });

  const flavorsByName = new Map<string, typeof modifiers>();
  for (const modifier of modifiers) {
    const key = normalizedCatalogName(modifier.name);
    flavorsByName.set(key, [...(flavorsByName.get(key) ?? []), modifier]);
  }
  const flavorEntries: AvailabilityEntry[] = [...flavorsByName.entries()].map(([key, copies]): AvailabilityEntry => {
    const first = copies[0]!;
    const activeCount = copies.filter((copy) => copy.active).length;
    const groupList = [...new Set(copies.map((copy) => groupNames.get(copy.modifier_group_id) ?? "Grupo"))];
    const productCount = new Set(copies.flatMap((copy) => [...(productsByGroup.get(copy.modifier_group_id) ?? [])])).size;
    const where = copies.length === 1 ? groupList[0] : `em ${copies.length} grupos`;
    const usage = productCount === 0 ? "em nenhum produto" : productCount === 1 ? "usado em 1 produto" : `usado em ${productCount} produtos`;
    const state = activeCount === copies.length ? "on" : activeCount === 0 ? "off" : "partial";
    return {
      kind: "flavor",
      id: first.id,
      name: first.name,
      detail: `Sabor/opção · ${where} · ${usage}`,
      state,
      statusLabel: state === "on" ? "Ativo" : state === "off" ? "Pausado" : `Pausado em ${copies.length - activeCount} de ${copies.length} grupos`,
      searchText: normalizedCatalogName(`${first.name} ${groupList.join(" ")} ${key}`),
    };
  });

  const byName = (a: AvailabilityEntry, b: AvailabilityEntry) => a.name.localeCompare(b.name, "pt-BR");
  const filter = params.filtro === "pausados" || params.filtro === "produtos" || params.filtro === "sabores" ? params.filtro : "todos";

  return (
    <AvailabilityBoard
      products={productEntries.sort(byName)}
      flavors={flavorEntries.sort(byName)}
      initialQuery={(params.q ?? "").trim()}
      initialFilter={filter}
      autoFocus={params.buscar === "1"}
    />
  );
}
