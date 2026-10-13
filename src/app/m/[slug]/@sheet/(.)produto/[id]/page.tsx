import { ProductDetail } from "@/features/menu/product-detail";
import { ProductSheet } from "@/features/menu/product-sheet";

/** Tocar num item do cardápio abre a montagem como gaveta por cima da lista (protótipo Expresso). */
export default async function ProductSheetRoute({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ erro?: string; editar?: string; voltar?: string }> }) {
  const { slug, id } = await params;
  const query = await searchParams;
  return <ProductSheet label="Montar item"><ProductDetail slug={slug} id={id} query={query} presentation="sheet" /></ProductSheet>;
}
