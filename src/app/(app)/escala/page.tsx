import { ScaleService } from "@/server/platform/scale-service";
import { configureBrandingAction,configureDomainAction,verifyDomainAction,createScaleGroupAction,assignScaleStoreAction,installIntegrationAction } from "@/features/platform/actions";

function money(cents:number|bigint|null|undefined){ return new Intl.NumberFormat("pt-BR",{ style:"currency",currency:"BRL" }).format(Number(cents??0)/100); }
function entitlementLabel(value:{ enabled:boolean;limit_value:number|null;used:number;remaining:number|null }){ if(!value.enabled) return "Não incluído"; if(value.limit_value===null) return "Incluído"; return `${value.remaining??0} restante(s) de ${value.limit_value}`; }

export default async function ScalePage(){
  const data=await ScaleService.load();
  const bi=(data.bi??{}) as { totals?:{ completed_orders?:number;sales_cents?:number };stores?:Array<{ store_id:string;store_name:string;completed_orders:number;sales_cents:number;average_ticket_cents:number }> };
  const needs=(data.centralPurchasing??[]) as Array<{ store_id:string;store_name:string;inventory_item_id:string;item_name:string;base_unit:string;current_quantity:number;minimum_quantity:number;shortage_quantity:number;preferred_supplier_name:string|null;purchase_unit_label:string|null;last_unit_cost_cents:number|null }>;
  const marketplace=(data.marketplace??[]) as Array<{ adapter_key:string;kind:string;display_name:string;description:string|null;installed:boolean;active:boolean }>;
  const memberships=new Map<string,string[]>();
  for(const row of data.groupStores){ const values=memberships.get(row.group_id)??[]; values.push(row.store_id); memberships.set(row.group_id,values); }
  return <div style={{ display:"grid",gap:18 }}>
    <header><h1 style={{ marginBottom:6 }}>Planos, escala e white-label</h1><p className="muted" style={{ margin:0 }}>Plano define capacidades; RBAC continua definindo quem pode executar cada ação.</p></header>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Assinatura</h2>
      <div style={{ display:"flex",gap:24,flexWrap:"wrap" }}><div><strong>{data.plan?.name??"Sem plano ativo"}</strong><div className="muted">Status: {data.subscription?.status??"—"}</div></div><div className="muted">Ciclo: {data.subscription?.billing_interval??"—"}</div><div className="muted">Provider: {data.subscription?.billing_provider_key??"manual/plataforma"}</div></div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10,marginTop:14 }}>
        {Object.entries(data.entitlements).map(([key,value])=><div key={key} className="card" style={{ padding:12,background:"var(--surface-2)" }}><strong style={{ fontSize:13 }}>{key}</strong><div className="muted" style={{ marginTop:4 }}>{entitlementLabel(value)}</div></div>)}
      </div>
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Branding</h2>
      <form action={configureBrandingAction} style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10 }}>
        <label>Nome<input name="productName" defaultValue={data.branding?.product_name??""} style={{ width:"100%" }} /></label>
        <label>Logo URL/ref<input name="logoAssetRef" defaultValue={data.branding?.logo_asset_ref??""} style={{ width:"100%" }} /></label>
        <label>Cor principal<input name="primaryColor" defaultValue={data.branding?.primary_color??"#FF6B00"} style={{ width:"100%" }} /></label>
        <label>Cor secundária<input name="secondaryColor" defaultValue={data.branding?.secondary_color??"#E65300"} style={{ width:"100%" }} /></label>
        <label>Suporte URL<input name="supportUrl" defaultValue={data.branding?.support_url??""} style={{ width:"100%" }} /></label>
        <label style={{ display:"flex",alignItems:"center",gap:8 }}><input type="checkbox" name="whiteLabelEnabled" defaultChecked={Boolean(data.branding?.white_label_enabled)} /> White-label</label>
        <label style={{ display:"flex",alignItems:"center",gap:8 }}><input type="checkbox" name="hidePedeAquiBranding" defaultChecked={Boolean(data.branding?.hide_pedeaqui_branding)} /> Ocultar assinatura PedeAqui</label>
        <button type="submit" disabled={!data.canEdit}>Salvar branding</button>
      </form>
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Domínios personalizados</h2>
      <form action={configureDomainAction} style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:12 }}><input name="hostname" placeholder="pedidos.suaempresa.com.br" required /><select name="storeId"><option value="">Organização</option>{data.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select><button disabled={!data.canEdit}>Adicionar domínio</button></form>
      <div style={{ display:"grid",gap:8 }}>{data.domains.map(domain=><div key={domain.id} className="card" style={{ padding:12,background:"var(--surface-2)" }}><strong>{domain.hostname}</strong> · {domain.status}<div className="muted" style={{ fontSize:12 }}>Crie TXT em <code>_pedeaqui.{domain.hostname}</code> com valor <code>pedeaqui-verification={domain.verification_token}</code></div>{domain.last_error?<div style={{ color:"var(--danger)" }}>{domain.last_error}</div>:null}<form action={verifyDomainAction} style={{ marginTop:8 }}><input type="hidden" name="domainId" value={domain.id}/><button disabled={!data.canEdit||domain.status==="verified"}>{domain.status==="verified"?"Verificado":"Verificar DNS"}</button></form></div>)}</div>
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Grupos / franquias</h2>
      <form action={createScaleGroupAction} style={{ display:"flex",gap:8,flexWrap:"wrap" }}><input name="key" placeholder="interior-sp" required /><input name="name" placeholder="Interior SP" required /><button disabled={!data.canEdit}>Criar grupo</button></form>
      <div style={{ display:"grid",gap:10,marginTop:12 }}>{data.groups.map(group=><div className="card" key={group.id} style={{ padding:12,background:"var(--surface-2)" }}><strong>{group.name}</strong><div className="muted" style={{ fontSize:12 }}>Unidades: {(memberships.get(group.id)??[]).map(id=>data.stores.find(store=>store.id===id)?.name??id).join(", ")||"nenhuma"}</div><form action={assignScaleStoreAction} style={{ display:"flex",gap:8,marginTop:8 }}><input type="hidden" name="groupId" value={group.id}/><select name="storeId">{data.stores.filter(store=>store.status==="active").map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select><button disabled={!data.canEdit}>Vincular</button></form></div>)}</div>
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Central de compras</h2>
      {!data.entitlements["scale.central_purchasing"].enabled?<p className="muted">Recurso não incluído no plano.</p>:needs.length===0?<p className="muted">Nenhuma unidade abaixo do estoque mínimo.</p>:<div style={{ overflowX:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse" }}><thead><tr><th align="left">Insumo</th><th align="left">Unidade</th><th align="right">Atual</th><th align="right">Mínimo</th><th align="right">Falta</th><th align="left">Fornecedor preferido</th></tr></thead><tbody>{needs.map(row=><tr key={`${row.store_id}:${row.inventory_item_id}`}><td>{row.item_name}</td><td>{row.store_name}</td><td align="right">{row.current_quantity}</td><td align="right">{row.minimum_quantity}</td><td align="right">{row.shortage_quantity} {row.base_unit}</td><td>{row.preferred_supplier_name??"—"}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>BI multiunidade · últimos 30 dias</h2>
      {!data.entitlements["scale.bi"].enabled?<p className="muted">Recurso não incluído no plano.</p>:<><div style={{ display:"flex",gap:22,flexWrap:"wrap" }}><div><strong>{bi.totals?.completed_orders??0}</strong><div className="muted">pedidos concluídos</div></div><div><strong>{money(bi.totals?.sales_cents)}</strong><div className="muted">vendas</div></div></div><div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginTop:12 }}>{(bi.stores??[]).map(store=><div className="card" key={store.store_id} style={{ padding:12,background:"var(--surface-2)" }}><strong>{store.store_name}</strong><div>{money(store.sales_cents)}</div><div className="muted">{store.completed_orders} pedidos · ticket {money(store.average_ticket_cents)}</div></div>)}</div></>}
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Marketplace de integrações</h2>
      {!data.entitlements["integrations.marketplace"].enabled?<p className="muted">Recurso não incluído no plano.</p>:marketplace.length===0?<p className="muted">Nenhum adapter publicado no catálogo.</p>:<div style={{ display:"grid",gap:10 }}>{marketplace.map(item=><div className="card" key={item.adapter_key} style={{ padding:12,background:"var(--surface-2)" }}><strong>{item.display_name}</strong> <span className="muted">· {item.kind}</span><p className="muted">{item.description}</p><form action={installIntegrationAction} style={{ display:"flex",gap:8,flexWrap:"wrap" }}><input type="hidden" name="adapterKey" value={item.adapter_key}/><select name="environment"><option value="sandbox">Sandbox</option><option value="homologation">Homologação</option><option value="production">Produção</option></select><input name="secretRef" placeholder="SECRET_ENV_REF"/><input name="webhookSecretRef" placeholder="WEBHOOK_SECRET_REF"/><button disabled={!data.canEdit}>{item.installed?"Atualizar":"Instalar"}</button></form></div>)}</div>}
    </section>
  </div>;
}
