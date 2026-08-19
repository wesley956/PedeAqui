import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { CategoryService } from "@/server/catalog/category-service";
import { createCategoryFormAction } from "@/features/catalog/actions";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";

export default async function CategoriesPage() {
  const categories = await CategoryService.list();

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Categorias</h1>
        <p className="muted">Organize a navegação do cardápio por ordem e disponibilidade.</p>
      </div>

      <ResilientMutationForm action={createCategoryFormAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Nova categoria</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Input label="Nome" name="name" required maxLength={80} />
          <Input label="Ordem" name="sortOrder" type="number" min={0} defaultValue={0} />
        </div>
        <Input label="Descrição" name="description" maxLength={240} />
        <ImageUploadField name="imageFile" label="Imagem da categoria" />
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input name="active" type="checkbox" defaultChecked />
          <span>Categoria ativa</span>
        </label>
        <div><Button type="submit">Criar categoria</Button></div>
      </ResilientMutationForm>

      <div style={{ display: "grid", gap: 10 }}>
        {categories.length === 0 ? (
          <article className="card" style={{ padding: 20 }}><span className="muted">Nenhuma categoria cadastrada.</span></article>
        ) : categories.map((category) => (
          <article key={category.id} className="card" style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <strong>{category.name}</strong>
              <div className="muted" style={{ fontSize: 13 }}>Ordem {category.sort_order}</div>
            </div>
            <span className="muted">{category.active ? "Ativa" : "Inativa"}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
