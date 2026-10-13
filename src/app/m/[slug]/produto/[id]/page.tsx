import { ProductDetail } from "@/features/menu/product-detail";
import styles from "./public-product.module.css";

export default async function PublicProductPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ erro?: string; editar?: string; voltar?: string }> }) {
  const { slug, id } = await params;
  const query = await searchParams;
  return <main className={styles.root}><ProductDetail slug={slug} id={id} query={query} presentation="page" /></main>;
}
