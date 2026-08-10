import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryService } from "@/server/catalog/category-service";
import { createProductAction } from "@/features/catalog/actions";

const fieldStyle = {
  width: "100%",
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
} as const;

export default async function NewProductPage() {
  const categories = await CategoryService.list();

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 820 }}>
      <div>
        <Link href="/cardapio/produtos" className="muted">← Voltar</Link>
        <h1>Novo produto</h1>
        <p className="muted">Cadastre preço, categoria e informações operacionais.</p>
      </div>

      <form action={createProductAction} className="card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <Input label="Nome" name="name" required maxLength={120} />

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Descrição</span>
          <textarea name="description" rows={4} maxLength={1000} style={fieldStyle} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Categoria</span>
          <select name="categoryId" defaultValue="" style={fieldStyle}>
            <option value="">Sem categoria</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Input label="Preço" name="price" inputMode="decimal" placeholder="29,90" required />
          <Input label="Preço promocional" name="promotionalPrice" inputMode="decimal" placeholder="24,90" />
          <Input label="Custo" name="cost" inputMode="decimal" placeholder="12,50" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Input label="SKU" name="sku" maxLength={64} />
          <Input label="Código de barras" name="barcode" maxLength={64} />
          <Input label="Preparo (min)" name="preparationTimeMinutes" type="number" min={0} max={1440} defaultValue={0} />
        </div>

        <Input label="URL da imagem" name="imageUrl" type="url" hint="O upload direto será ativado quando o storage do novo ambiente for provisionado." />

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Disponibilidade inicial</span>
          <select name="availability" defaultValue="available" style={fieldStyle}>
            <option value="available">Disponível</option>
            <option value="sold_out">Esgotado</option>
            <option value="inactive">Inativo</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input name="active" type="checkbox" defaultChecked />
          <span>Produto ativo no catálogo</span>
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Link href="/cardapio/produtos" style={{ alignSelf: "center" }}>Cancelar</Link>
          <Button type="submit">Salvar produto</Button>
        </div>
      </form>
    </section>
  );
}
