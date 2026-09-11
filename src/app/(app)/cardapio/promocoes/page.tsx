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

function weekdayLabel(values: number[]) {
  return values.map((day) => days.find(([value]) => value === day)?.[1]).filter(Boolean).join(", ");
}

export default async function PromotionsPage() {
  const [products, promotions] = await Promise.all([ProductService.list(), PromotionService.list()]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const eligibleProducts = products.filter((product) => product.active && product.availability !== "inactive");

  const groups = new Map<string, typeof promotions>();
  for (const promotion of promotions) {
    const key = promotion.promotion_group_id || promotion.id;
    groups.set(key, [...(groups.get(key) ?? []), promotion]);
  }
  const campaigns = [...groups.entries()];
  const activeCount = campaigns.filter(([, rows]) => rows.some((row) => row.active)).length;

  return <section className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <h1>Promoções</h1>
        <p className="muted">Crie campanhas com vários produtos e defina dias, horários e períodos diferentes para cada item.</p>
      </div>
    </header>

    <div className={styles.summary} aria-label="Resumo das promoções">
      <span><strong>{campaigns.length}</strong> promoções</span>
      <span><strong>{activeCount}</strong> ativas</span>
      <span><strong>{eligibleProducts.length}</strong> produtos disponíveis</span>
    </div>

    <ResilientMutationForm action={savePromotionAction} successReset className={`card ${styles.formCard} ${styles.promotionForm}`}>
      <div className={styles.promotionFormHeader}>
        <div>
          <h2>Nova promoção</h2>
          <p className="muted">Selecione os produtos e programe cada um do jeito que quiser dentro da mesma campanha.</p>
        </div>
        <span className={styles.metaChip}>Programação por produto</span>
      </div>

      <label>Nome da promoção
        <input name="campaignName" maxLength={80} placeholder="Ex.: Promoção da semana" />
      </label>

      <div className={styles.promotionSectionHeader}>
        <div>
          <h3>Produtos da promoção</h3>
          <p className="muted">Marque os produtos desejados. Cada produto pode ter preço, dias e horários próprios.</p>
        </div>
      </div>

      <div className={styles.managementList}>
        {eligibleProducts.map((product) => <article key={product.id} className={`card ${styles.managementCard}`}>
          <div className={styles.managementTop}>
            <div className={styles.productMain}>
              <div className={styles.productTitleRow}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" name="productId" value={product.id} />
                  <span className={styles.productName}>{product.name}</span>
                </label>
              </div>
              <span className="muted">Preço normal: {money(product.price_cents)}</span>
            </div>
            <label style={{ minWidth: 180 }}>Preço promocional
              <input name={`price_${product.id}`} inputMode="decimal" placeholder="Ex.: 6,50" aria-label={`Preço promocional de ${product.name}`} />
            </label>
          </div>

          <fieldset className={styles.promotionDays}>
            <legend>Dias desse produto</legend>
            <div className={styles.dayChips}>
              {days.map(([value, label]) => <label key={value} className={styles.dayChip}>
                <input type="checkbox" name={`weekday_${product.id}`} value={value} />
                <span>{label}</span>
              </label>)}
            </div>
          </fieldset>

          <details className={styles.promotionAdvanced}>
            <summary>Horário e período desse produto</summary>
            <p className="muted">Opcional. Sem data final, ele continua recorrente nos dias marcados.</p>
            <div className={styles.formGrid}>
              <label>Começa em<input type="date" name={`startsOn_${product.id}`} /></label>
              <label>Termina em<input type="date" name={`endsOn_${product.id}`} /></label>
              <label>Horário inicial<input type="time" name={`startsAt_${product.id}`} /></label>
              <label>Horário final<input type="time" name={`endsAt_${product.id}`} /></label>
            </div>
          </details>
        </article>)}
      </div>

      <label>Texto curto da campanha
        <input name="label" maxLength={48} placeholder="Ex.: Oferta especial" />
      </label>

      <div className={styles.promotionFormActions}>
        <label className={styles.promotionActiveToggle}><input type="checkbox" name="active" defaultChecked /> Ativar promoção ao salvar</label>
        <Button type="submit" disabled={eligibleProducts.length === 0}>Criar promoção</Button>
      </div>
    </ResilientMutationForm>

    <div className={styles.promotionSectionHeader}>
      <div>
        <h2>Promoções cadastradas</h2>
        <p className="muted">Dentro de cada campanha, cada produto mostra sua própria programação.</p>
      </div>
    </div>

    {campaigns.length === 0 ? <article className={`card ${styles.empty}`}>
      <h2>Nenhuma promoção cadastrada</h2>
      <p className="muted">Crie a primeira promoção usando o formulário acima.</p>
    </article> : <div className={styles.managementList}>
      {campaigns.map(([groupId, rows]) => {
        const first = rows[0];
        if (!first) return null;
        const active = rows.some((row) => row.active);
        return <article className={`card ${styles.managementCard} ${styles.promotionCard}`} key={groupId}>
          <div className={styles.managementTop}>
            <div className={styles.productMain}>
              <div className={styles.productTitleRow}>
                <span className={styles.productName}>{first.campaign_name || first.label || "Promoção"}</span>
                <SemanticStatus tone={active ? "success" : "neutral"} icon={active ? "✓" : "○"} label={active ? "Ativa" : "Desativada"} />
              </div>
              <div className={styles.productMeta}>
                <span className={styles.metaChip}>{rows.length} {rows.length === 1 ? "produto" : "produtos"}</span>
                {first.label ? <span className={styles.metaChip}>{first.label}</span> : null}
              </div>
            </div>
          </div>

          <div className={styles.managementList}>
            {rows.map((promotion) => {
              const product = productMap.get(promotion.product_id);
              const startDate = dateLabel(promotion.starts_on);
              const endDate = dateLabel(promotion.ends_on);
              const schedule = `${time(promotion.starts_at) || "Dia inteiro"}${promotion.ends_at ? ` – ${time(promotion.ends_at)}` : ""}`;
              return <div key={promotion.id} className={styles.managementTop}>
                <div className={styles.productMain}>
                  <strong>{product?.name ?? "Produto removido"}</strong>
                  <div className={styles.productMeta}>
                    <span className={styles.metaChip}>{weekdayLabel(promotion.weekdays) || "Sem dias"}</span>
                    <span className={styles.metaChip}>{schedule}</span>
                    {(startDate || endDate) ? <span className={styles.metaChip}>{startDate ?? "Sem início"} → {endDate ?? "Sem fim"}</span> : null}
                  </div>
                </div>
                <div className={styles.promotionPriceBlock}>
                  {product ? <span className={styles.promotionOldPrice}>{money(product.price_cents)}</span> : null}
                  <strong>{money(promotion.promotional_price_cents)}</strong>
                </div>
              </div>;
            })}
          </div>

          <div className={styles.managementActions}>
            <span className="muted">Cada produto segue sua própria programação. Em sobreposição, vale o menor preço ativo.</span>
            <ResilientMutationForm action={removePromotionAction} successReset={false}>
              <input type="hidden" name="promotionGroupId" value={groupId} />
              <Button type="submit" tone="secondary">Remover promoção</Button>
            </ResilientMutationForm>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
