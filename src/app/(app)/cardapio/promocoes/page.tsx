import { Button } from "@/components/ui/button";
import { SemanticStatus } from "@/components/ui/status";
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

function dateLabel(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default async function PromotionsPage() {
  const [products, promotions] = await Promise.all([ProductService.list(), PromotionService.list()]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const eligibleProducts = products.filter((product) => product.active && product.availability !== "inactive");
  const activeCount = promotions.filter((promotion) => promotion.active).length;

  return <section className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <h1>Promoções</h1>
        <p className="muted">Programe ofertas sem alterar o preço normal do produto. O PedeAqui ativa e encerra cada promoção automaticamente.</p>
      </div>
    </header>

    <div className={styles.summary} aria-label="Resumo das promoções">
      <span><strong>{promotions.length}</strong> programadas</span>
      <span><strong>{activeCount}</strong> ativas</span>
      <span><strong>{eligibleProducts.length}</strong> produtos disponíveis</span>
    </div>

    <ResilientMutationForm action={savePromotionAction} successReset className={`card ${styles.formCard} ${styles.promotionForm}`}>
      <div className={styles.promotionFormHeader}>
        <div>
          <h2>Nova promoção</h2>
          <p className="muted">Escolha o produto, defina o novo preço e marque quando a oferta deve aparecer.</p>
        </div>
        <span className={styles.metaChip}>Automática</span>
      </div>

      <div className={styles.promotionPrimaryGrid}>
        <label>Produto
          <select name="productId" required defaultValue="">
            <option value="" disabled>Selecione um produto</option>
            {eligibleProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price_cents)}</option>)}
          </select>
        </label>
        <label>Preço promocional
          <input name="promotionalPrice" inputMode="decimal" placeholder="Ex.: 6,50" required />
        </label>
      </div>

      <fieldset className={styles.promotionDays}>
        <legend>Dias da semana</legend>
        <div className={styles.dayChips}>
          {days.map(([value, label]) => <label key={value} className={styles.dayChip}>
            <input type="checkbox" name="weekday" value={value} />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>

      <details className={styles.promotionAdvanced}>
        <summary>Datas, horários e texto da oferta</summary>
        <p className="muted">Opcional. Use quando a promoção tiver período ou horário específico.</p>
        <div className={styles.formGrid}>
          <label>Começa em<input type="date" name="startsOn" /></label>
          <label>Termina em<input type="date" name="endsOn" /></label>
          <label>Horário inicial<input type="time" name="startsAt" /></label>
          <label>Horário final<input type="time" name="endsAt" /></label>
        </div>
        <label>Texto curto
          <input name="label" maxLength={48} placeholder="Ex.: Só hoje, Quarta da Coxinha, Até 20h" />
        </label>
      </details>

      <div className={styles.promotionFormActions}>
        <label className={styles.promotionActiveToggle}><input type="checkbox" name="active" defaultChecked /> Ativar promoção ao salvar</label>
        <Button type="submit" disabled={eligibleProducts.length === 0}>Salvar promoção</Button>
      </div>
    </ResilientMutationForm>

    <div className={styles.promotionSectionHeader}>
      <div>
        <h2>Promoções programadas</h2>
        <p className="muted">Visualize rapidamente preço, período e status de cada oferta.</p>
      </div>
    </div>

    {promotions.length === 0 ? <article className={`card ${styles.empty}`}>
      <h2>Nenhuma promoção programada</h2>
      <p className="muted">Crie a primeira oferta usando o formulário acima.</p>
    </article> : <div className={styles.managementList}>
      {promotions.map((promotion) => {
        const product = productMap.get(promotion.product_id);
        const selectedDays = promotion.weekdays.map((day: number) => days.find(([value]) => value === day)?.[1]).filter(Boolean).join(", ");
        const startDate = dateLabel(promotion.starts_on);
        const endDate = dateLabel(promotion.ends_on);
        const schedule = `${time(promotion.starts_at) || "Dia inteiro"}${promotion.ends_at ? ` – ${time(promotion.ends_at)}` : ""}`;
        return <article className={`card ${styles.managementCard} ${styles.promotionCard}`} key={promotion.id}>
          <div className={styles.managementTop}>
            <div className={styles.productMain}>
              <div className={styles.productTitleRow}>
                <span className={styles.productName}>{product?.name ?? "Produto removido"}</span>
                <SemanticStatus tone={promotion.active ? "success" : "neutral"} icon={promotion.active ? "✓" : "○"} label={promotion.active ? "Ativa" : "Desativada"} />
              </div>
              <div className={styles.productMeta}>
                <span className={styles.metaChip}>{selectedDays || "Sem dias"}</span>
                <span className={styles.metaChip}>{schedule}</span>
                {(startDate || endDate) ? <span className={styles.metaChip}>{startDate ?? "Sem início"} → {endDate ?? "Sem fim"}</span> : null}
                {promotion.label ? <span className={styles.metaChip}>{promotion.label}</span> : null}
              </div>
            </div>
            <div className={styles.promotionPriceBlock}>
              {product ? <span className={styles.promotionOldPrice}>{money(product.price_cents)}</span> : null}
              <strong>{money(promotion.promotional_price_cents)}</strong>
            </div>
          </div>
          <div className={styles.managementActions}>
            <span className="muted">O preço normal é restaurado automaticamente fora da programação.</span>
            <ResilientMutationForm action={removePromotionAction} successReset={false}>
              <input type="hidden" name="promotionId" value={promotion.id} />
              <Button type="submit" tone="secondary">Remover programação</Button>
            </ResilientMutationForm>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
