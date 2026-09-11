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
        <p className="muted">Crie quantas promoções quiser, para um ou vários produtos. Uma promoção não substitui outra.</p>
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
          <p className="muted">Dê um nome à campanha, selecione os produtos e informe o preço promocional de cada um.</p>
        </div>
        <span className={styles.metaChip}>Sem limite</span>
      </div>

      <label>Nome da promoção
        <input name="campaignName" maxLength={80} placeholder="Ex.: Quinta da Coxinha, Sábado Especial" />
      </label>

      <div className={styles.promotionSectionHeader}>
        <div>
          <h3>Produtos da promoção</h3>
          <p className="muted">Marque um ou vários produtos. Cada produto pode participar de outras promoções também.</p>
        </div>
      </div>

      <div className={styles.managementList}>
        {eligibleProducts.map((product) => <label key={product.id} className={`card ${styles.managementCard}`} style={{ cursor: "pointer" }}>
          <div className={styles.managementTop}>
            <div className={styles.productMain}>
              <div className={styles.productTitleRow}>
                <input type="checkbox" name="productId" value={product.id} />
                <span className={styles.productName}>{product.name}</span>
              </div>
              <span className="muted">Preço normal: {money(product.price_cents)}</span>
            </div>
            <div style={{ minWidth: 180 }}>
              <span className="muted">Preço promocional</span>
              <input name={`price_${product.id}`} inputMode="decimal" placeholder="Ex.: 6,50" aria-label={`Preço promocional de ${product.name}`} />
            </div>
          </div>
        </label>)}
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
        <p className="muted">Opcional. Sem data final, a promoção fica recorrente nos dias selecionados.</p>
        <div className={styles.formGrid}>
          <label>Começa em<input type="date" name="startsOn" /></label>
          <label>Termina em<input type="date" name="endsOn" /></label>
          <label>Horário inicial<input type="time" name="startsAt" /></label>
          <label>Horário final<input type="time" name="endsAt" /></label>
        </div>
        <label>Texto curto
          <input name="label" maxLength={48} placeholder="Ex.: Só hoje, Até 20h, Oferta especial" />
        </label>
      </details>

      <div className={styles.promotionFormActions}>
        <label className={styles.promotionActiveToggle}><input type="checkbox" name="active" defaultChecked /> Ativar promoção ao salvar</label>
        <Button type="submit" disabled={eligibleProducts.length === 0}>Criar promoção</Button>
      </div>
    </ResilientMutationForm>

    <div className={styles.promotionSectionHeader}>
      <div>
        <h2>Promoções cadastradas</h2>
        <p className="muted">Cada promoção é independente. Criar outra não altera as que já existem.</p>
      </div>
    </div>

    {campaigns.length === 0 ? <article className={`card ${styles.empty}`}>
      <h2>Nenhuma promoção cadastrada</h2>
      <p className="muted">Crie a primeira promoção usando o formulário acima.</p>
    </article> : <div className={styles.managementList}>
      {campaigns.map(([groupId, rows]) => {
        const first = rows[0];
        if (!first) return null;
        const selectedDays = first.weekdays.map((day: number) => days.find(([value]) => value === day)?.[1]).filter(Boolean).join(", ");
        const startDate = dateLabel(first.starts_on);
        const endDate = dateLabel(first.ends_on);
        const schedule = `${time(first.starts_at) || "Dia inteiro"}${first.ends_at ? ` – ${time(first.ends_at)}` : ""}`;
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
                <span className={styles.metaChip}>{selectedDays || "Sem dias"}</span>
                <span className={styles.metaChip}>{schedule}</span>
                {(startDate || endDate) ? <span className={styles.metaChip}>{startDate ?? "Sem início"} → {endDate ?? "Sem fim"}</span> : null}
                {first.label ? <span className={styles.metaChip}>{first.label}</span> : null}
              </div>
            </div>
          </div>

          <div className={styles.managementList}>
            {rows.map((promotion) => {
              const product = productMap.get(promotion.product_id);
              return <div key={promotion.id} className={styles.managementTop}>
                <span>{product?.name ?? "Produto removido"}</span>
                <div className={styles.promotionPriceBlock}>
                  {product ? <span className={styles.promotionOldPrice}>{money(product.price_cents)}</span> : null}
                  <strong>{money(promotion.promotional_price_cents)}</strong>
                </div>
              </div>;
            })}
          </div>

          <div className={styles.managementActions}>
            <span className="muted">Se houver duas promoções válidas para o mesmo produto, o menor preço é aplicado automaticamente.</span>
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
