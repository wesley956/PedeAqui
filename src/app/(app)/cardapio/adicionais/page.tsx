import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModifierService } from "@/server/catalog/modifier-service";
import { createModifierAction, createModifierGroupAction } from "@/features/catalog/actions";
import { formatCents } from "@/server/catalog/money";

const selectStyle = {
  width: "100%",
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
} as const;

export default async function ModifiersPage() {
  const [groups, modifiers] = await Promise.all([
    ModifierService.listGroups(),
    ModifierService.listModifiers(),
  ]);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Adicionais</h1>
        <p className="muted">Crie grupos como “Escolha a bebida” e opções como “Coca-Cola + R$ 3,00”.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <form action={createModifierGroupAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo grupo</h2>
          <Input label="Nome" name="name" required />
          <Input label="Descrição" name="description" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Mínimo" name="minSelection" type="number" min={0} defaultValue={0} />
            <Input label="Máximo" name="maxSelection" type="number" min={1} defaultValue={1} />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="required" type="checkbox" /> Obrigatório</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="active" type="checkbox" defaultChecked /> Ativo</label>
          <Button type="submit">Criar grupo</Button>
        </form>

        <form action={createModifierAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo adicional</h2>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Grupo</span>
            <select name="modifierGroupId" required disabled={groups.length === 0} style={selectStyle}>
              {groups.length === 0 ? <option value="">Crie um grupo primeiro</option> : groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <Input label="Nome" name="name" required />
          <Input label="Preço adicional" name="price" inputMode="decimal" defaultValue="0,00" required />
          <Input label="Ordem" name="sortOrder" type="number" min={0} defaultValue={0} />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="active" type="checkbox" defaultChecked /> Ativo</label>
          <Button type="submit" disabled={groups.length === 0}>Criar adicional</Button>
        </form>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {groups.map((group) => {
          const items = modifiers.filter((modifier) => modifier.modifier_group_id === group.id);
          return (
            <article key={group.id} className="card" style={{ padding: 18, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div><strong>{group.name}</strong><div className="muted" style={{ fontSize: 13 }}>{group.required ? "Obrigatório" : "Opcional"} · {group.min_selection}–{group.max_selection} seleção(ões)</div></div>
                <span className="muted">{group.active ? "Ativo" : "Inativo"}</span>
              </div>
              {items.length === 0 ? <span className="muted">Nenhum adicional neste grupo.</span> : items.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <span>{item.name}</span>
                  <span className="muted">+ {formatCents(item.price_cents)}</span>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}
