import { Button } from "@/components/ui/button";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { removePromotionAction, savePromotionAction } from "@/features/promotions/actions";
import { ProductService } from "@/server/catalog/product-service";
import { PromotionService } from "@/server/promotions/promotion-service";
import styles from "../catalog-management.module.css";

const days = [
  [0, "Dom"], [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"],
] as const;

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function time(value: string | null) { return value ? value.slice(0, 5) : ""; }

export default async function PromotionsPage() {
  const [products, promotions] = await Promise.all([ProductService.list(), PromotionService.list()]);
  const productMap = new Map(products.map((product) => [product.id, product]));

  return <section className={styles.page}>
    <header className={styles.headerCopy}>
      <h1>Promoções programadas</h1>
      <p className="muted">Escolha o produto, o valor e os dias. O preço normal nunca é apagado: a oferta entra e sai automaticamente conforme a programação.</p>
    </header>

    <ResilientMutationForm action={savePromotionAction} successReset className={`card ${styles.formCard}`}>
      <div><strong>Nova promoção ou atualização</strong><p className="muted" style={{ marginBottom: 0 }}>Se o produto já tiver uma programação, salvar novamente atualiza a mesma regra sem duplicar o item.</p></div>
      <label>Produto
        <select name="productId" required defaultValue="">
          <option value="" disabled>Selecione um produto</option>
          {products.filter((product) => product.active && product.availability !== "inactive").map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price_cents)}</option>)}
        </select>
      </label>
      <label>Preço promocional
        <input name="promotionalPrice" inputMode="decimal" placeholder="Ex.: 6,50" required />
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 8 }}>Dias da semana</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {days.map(([value, label]) => <label key={value} style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" name="weekday" value={value} /> {label}</label>)}
        </div>
      </fieldset>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <label>Começa em (opcional)<input type="date" name="startsOn" /></label>
        <label>Termina em (opcional)<input type="date" name="endsOn" /></label>
        <label>Horário inicial (opcional)<input type="time" name="startsAt" /></label>
        <label>Horário final (opcional)<input type="time" name="endsAt" /></label>
      </div>
      <label>Texto curto (opcional)
        <input name="label" maxLength={48} placeholder="Ex.: Só hoje, Quarta da Coxinha, Até 20h" />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="active" defaultChecked /> Promoção ativa</label>
      <Button type="submit" disabled={products.length === 0}>Salvar promoção</Button>
    </ResilientMutationForm>

    <div style={{ display: "grid", gap: 12 }}>
      {promotions.length === 0 ? <div className="card"><p className="muted" style={{ margin: 0 }}>Nenhuma promoção programada ainda.</p></div> : promotions.map((promotion) => {
        const product = productMap.get(promotion.product_id);
        return <article className="card" key={promotion.id} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div><strong>{product?.name ?? "Produto removido"}</strong><div className="muted">{product ? `${money(product.price_cents)} → ${money(promotion.promotional_price_cents)}` : money(promotion.promotional_price_cents)}</div></div>
            <span>{promotion.active ? "Ativa" : "Desativada"}</span>
          </div>
          <div className="muted">{promotion.weekdays.map((day: number) => days.find(([value]) => value === day)?.[1]).filter(Boolean).join(", ")} · {promotion.starts_on ?? "sem data inicial"} até {promotion.ends_on ?? "sem data final"} · {time(promotion.starts_at) || "dia inteiro"}{promotion.ends_at ? `–${time(promotion.ends_at)}` : ""}{promotion.label ? ` · “${promotion.label}”` : ""}</div>
          <ResilientMutationForm action={removePromotionAction} successReset={false}>
            <input type="hidden" name="promotionId" value={promotion.id} />
            <Button type="submit">Remover programação</Button>
          </ResilientMutationForm>
        </article>;
      })}
    </div>
  </section>;
}
