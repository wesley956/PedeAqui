import { ScaleService } from "@/server/platform/scale-service";
import {
  assignScaleStoreAction,
  configureBrandingAction,
  configureDomainAction,
  createScaleGroupAction,
  installIntegrationAction,
  verifyDomainAction,
} from "@/features/platform/actions";
import styles from "./scale-v3.module.css";

function money(cents: number | bigint | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents ?? 0) / 100);
}
function entitlementLabel(value: { enabled: boolean; limit_value: number | null; used: number; remaining: number | null }) {
  if (!value.enabled) return "Não incluído";
  if (value.limit_value === null) return "Incluído";
  return `${value.remaining ?? 0} disponível(is) de ${value.limit_value}`;
}
const featureLabels: Record<string, string> = {
  "scale.central_purchasing": "Central de compras",
  "scale.bi": "Visão multiunidade",
  "integrations.marketplace": "Integrações",
  "branding.white_label": "Marca própria",
  "custom_domains": "Domínios personalizados",
};
function featureLabel(key: string) {
  return featureLabels[key] ?? key.replace(/[._-]+/g, " ").replace(/^./, (value) => value.toUpperCase());
}
const subscriptionLabels: Record<string, string> = {
  active: "Ativo",
  trialing: "Em teste",
  past_due: "Pagamento pendente",
  canceled: "Cancelado",
  incomplete: "Configuração pendente",
};

export default async function ScalePage() {
  const data = await ScaleService.load();
  const bi = (data.bi ?? {}) as { totals?: { completed_orders?: number; sales_cents?: number }; stores?: Array<{ store_id: string; store_name: string; completed_orders: number; sales_cents: number; average_ticket_cents: number }> };
  const needs = (data.centralPurchasing ?? []) as Array<{ store_id: string; store_name: string; inventory_item_id: string; item_name: string; base_unit: string; current_quantity: number; minimum_quantity: number; shortage_quantity: number; preferred_supplier_name: string | null; purchase_unit_label: string | null; last_unit_cost_cents: number | null }>;
  const marketplace = (data.marketplace ?? []) as Array<{ adapter_key: string; kind: string; display_name: string; description: string | null; installed: boolean; active: boolean }>;
  const memberships = new Map<string, string[]>();
  for (const row of data.groupStores) {
    const values = memberships.get(row.group_id) ?? [];
    values.push(row.store_id);
    memberships.set(row.group_id, values);
  }
  const planStatus = data.subscription?.status ? subscriptionLabels[data.subscription.status] ?? data.subscription.status : "Sem assinatura";

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>GESTÃO AVANÇADA</p>
        <h1>Plano e expansão</h1>
        <p className={styles.muted}>Veja o que está incluído no plano, organize várias unidades e configure recursos de marca própria quando precisar.</p>
      </header>

      <div className={styles.metrics}>
        <article className={`card ${styles.metric}`}><span>Plano atual</span><strong>{data.plan?.name ?? "Sem plano ativo"}</strong></article>
        <article className={`card ${styles.metric}`}><span>Situação</span><strong>{planStatus}</strong></article>
        <article className={`card ${styles.metric}`}><span>Unidades</span><strong>{data.stores.length}</strong></article>
      </div>

      <article className={`card ${styles.card}`}>
        <div className={styles.sectionHead}>
          <div className={styles.sectionCopy}><h2>Recursos do plano</h2><p className={styles.muted}>O plano libera capacidades; as permissões da equipe continuam definindo quem pode usar cada área.</p></div>
        </div>
        <div className={styles.features}>
          {Object.entries(data.entitlements).map(([key, value]) => (
            <div className={styles.feature} key={key}>
              <strong>{featureLabel(key)}</strong>
              <small>{entitlementLabel(value)}</small>
            </div>
          ))}
        </div>
      </article>

      <details className={styles.details}>
        <summary>Marca própria e identidade</summary>
        <div className={styles.detailsBody}>
          <p className={styles.muted}>Use somente se sua operação tiver direito a personalização de marca.</p>
          <form action={configureBrandingAction} className={styles.formGrid}>
            <label className={styles.field}>Nome exibido<input className={styles.input} name="productName" defaultValue={data.branding?.product_name ?? ""} /></label>
            <label className={styles.field}>Logo (URL ou referência)<input className={styles.input} name="logoAssetRef" defaultValue={data.branding?.logo_asset_ref ?? ""} /></label>
            <label className={styles.field}>Cor principal<input className={styles.input} name="primaryColor" defaultValue={data.branding?.primary_color ?? "#FF6B00"} /></label>
            <label className={styles.field}>Cor secundária<input className={styles.input} name="secondaryColor" defaultValue={data.branding?.secondary_color ?? "#E65300"} /></label>
            <label className={styles.field}>Link de suporte<input className={styles.input} name="supportUrl" defaultValue={data.branding?.support_url ?? ""} /></label>
            <label className={styles.check}><input type="checkbox" name="whiteLabelEnabled" defaultChecked={Boolean(data.branding?.white_label_enabled)} /> Usar marca própria</label>
            <label className={styles.check}><input type="checkbox" name="hidePedeAquiBranding" defaultChecked={Boolean(data.branding?.hide_pedeaqui_branding)} /> Ocultar assinatura PedeAqui</label>
            <button className={styles.button} type="submit" disabled={!data.canEdit}>Salvar identidade</button>
          </form>
        </div>
      </details>

      <details className={styles.details}>
        <summary>Domínios personalizados</summary>
        <div className={styles.detailsBody}>
          <p className={styles.muted}>Conecte um endereço próprio, como pedidos.suaempresa.com.br, quando esse recurso estiver disponível no seu plano.</p>
          <form action={configureDomainAction} className={styles.rowForm}>
            <input className={styles.input} name="hostname" placeholder="pedidos.suaempresa.com.br" required />
            <select className={styles.input} name="storeId"><option value="">Toda a organização</option>{data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
            <button className={styles.button} disabled={!data.canEdit}>Adicionar domínio</button>
          </form>
          <div className={styles.list}>{data.domains.map((domain) => (
            <div key={domain.id} className={styles.item}>
              <strong>{domain.hostname}</strong>
              <span className={styles.muted}>Situação: {domain.status}</span>
              {domain.status !== "verified" ? <span className={styles.muted}>Para confirmar a propriedade, crie o registro TXT <code>_pedeaqui.{domain.hostname}</code> com o valor <code>pedeaqui-verification={domain.verification_token}</code>.</span> : null}
              {domain.last_error ? <span style={{ color: "var(--danger)" }}>{domain.last_error}</span> : null}
              <form action={verifyDomainAction}><input type="hidden" name="domainId" value={domain.id} /><button className={styles.button} disabled={!data.canEdit || domain.status === "verified"}>{domain.status === "verified" ? "Domínio verificado" : "Verificar domínio"}</button></form>
            </div>
          ))}</div>
        </div>
      </details>

      <article className={`card ${styles.card}`}>
        <div className={styles.sectionHead}><div className={styles.sectionCopy}><h2>Grupos de unidades</h2><p className={styles.muted}>Agrupe lojas ou franquias para facilitar uma operação com várias unidades.</p></div></div>
        <form action={createScaleGroupAction} className={styles.rowForm}>
          <input className={styles.input} name="key" placeholder="ex.: interior-sp" required />
          <input className={styles.input} name="name" placeholder="Ex.: Interior SP" required />
          <button className={styles.button} disabled={!data.canEdit}>Criar grupo</button>
        </form>
        <div className={styles.list}>{data.groups.map((group) => (
          <div className={styles.item} key={group.id}>
            <strong>{group.name}</strong>
            <span className={styles.muted}>Unidades: {(memberships.get(group.id) ?? []).map((id) => data.stores.find((store) => store.id === id)?.name ?? id).join(", ") || "nenhuma"}</span>
            <form action={assignScaleStoreAction} className={styles.rowForm}>
              <input type="hidden" name="groupId" value={group.id} />
              <select className={styles.input} name="storeId">{data.stores.filter((store) => store.status === "active").map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
              <button className={styles.button} disabled={!data.canEdit}>Adicionar unidade</button>
            </form>
          </div>
        ))}</div>
      </article>

      <article className={`card ${styles.card}`}>
        <div className={styles.sectionHead}><div className={styles.sectionCopy}><h2>Reposição entre unidades</h2><p className={styles.muted}>Veja onde o estoque está abaixo do mínimo e organize compras de forma centralizada.</p></div></div>
        {!data.entitlements["scale.central_purchasing"].enabled ? <p className={styles.muted}>Este recurso não está incluído no plano atual.</p> : needs.length === 0 ? <p className={styles.muted}>Nenhuma unidade está abaixo do estoque mínimo.</p> : (
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Insumo</th><th>Unidade</th><th>Atual</th><th>Mínimo</th><th>Falta</th><th>Fornecedor</th></tr></thead><tbody>{needs.map((row) => <tr key={`${row.store_id}:${row.inventory_item_id}`}><td>{row.item_name}</td><td>{row.store_name}</td><td>{row.current_quantity}</td><td>{row.minimum_quantity}</td><td>{row.shortage_quantity} {row.base_unit}</td><td>{row.preferred_supplier_name ?? "—"}</td></tr>)}</tbody></table></div>
        )}
      </article>

      <article className={`card ${styles.card}`}>
        <div className={styles.sectionHead}><div className={styles.sectionCopy}><h2>Resumo das unidades</h2><p className={styles.muted}>Visão consolidada dos últimos 30 dias.</p></div></div>
        {!data.entitlements["scale.bi"].enabled ? <p className={styles.muted}>Este recurso não está incluído no plano atual.</p> : <>
          <div className={styles.metrics}><article className={`card ${styles.metric}`}><span>Pedidos concluídos</span><strong>{bi.totals?.completed_orders ?? 0}</strong></article><article className={`card ${styles.metric}`}><span>Vendas</span><strong>{money(bi.totals?.sales_cents)}</strong></article></div>
          <div className={styles.storeGrid}>{(bi.stores ?? []).map((store) => <div className={styles.store} key={store.store_id}><strong>{store.store_name}</strong><span>{money(store.sales_cents)}</span><small className={styles.muted}>{store.completed_orders} pedidos · ticket {money(store.average_ticket_cents)}</small></div>)}</div>
        </>}
      </article>

      <details className={styles.details}>
        <summary>Integrações avançadas</summary>
        <div className={styles.detailsBody}>
          {!data.entitlements["integrations.marketplace"].enabled ? <p className={styles.muted}>Integrações adicionais não estão incluídas no plano atual.</p> : marketplace.length === 0 ? <p className={styles.muted}>Nenhuma integração disponível no catálogo.</p> : <div className={styles.list}>{marketplace.map((item) => <div className={styles.item} key={item.adapter_key}><strong>{item.display_name}</strong><span className={styles.muted}>{item.description}</span><form action={installIntegrationAction} className={styles.rowForm}><input type="hidden" name="adapterKey" value={item.adapter_key} /><select className={styles.input} name="environment"><option value="sandbox">Teste</option><option value="homologation">Homologação</option><option value="production">Produção</option></select><input className={styles.input} name="secretRef" placeholder="Referência da credencial" /><input className={styles.input} name="webhookSecretRef" placeholder="Referência do webhook" /><button className={styles.button} disabled={!data.canEdit}>{item.installed ? "Atualizar integração" : "Instalar integração"}</button></form></div>)}</div>}
        </div>
      </details>
    </section>
  );
}
