import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformAdminService,PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { platformSubscriptionAction,platformPlanAction,platformPlanFeatureAction,platformIntegrationCatalogAction } from "@/features/platform-admin/actions";

export default async function PlatformPage(){
  let data:Awaited<ReturnType<typeof PlatformAdminService.load>>;
  try{ data=await PlatformAdminService.load(); }catch(error){ if(error instanceof PlatformAuthorizationError) notFound(); throw error; }
  const subscriptionByOrg=new Map(data.subscriptions.map(item=>[item.organization_id,item]));
  const planById=new Map(data.plans.map(plan=>[plan.id,plan]));
  const canManage=data.role==="super_admin";
  return <main className="container" style={{ padding:"28px 0 50px",display:"grid",gap:18 }}>
    <header style={{ display:"flex",justifyContent:"space-between",gap:16,alignItems:"center" }}><div><div className="muted">PedeAqui · Plataforma</div><h1 style={{ margin:"4px 0" }}>Console SaaS</h1><p className="muted" style={{ margin:0 }}>Planos, assinaturas, catálogo e saúde de billing. Dados operacionais dos tenants não são carregados aqui.</p></div><Link href="/dashboard">Voltar à operação</Link></header>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Planos</h2>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:10 }}>{data.plans.map(plan=><div className="card" key={plan.id} style={{ padding:12,background:"var(--surface-2)" }}><strong>{plan.name}</strong><div className="muted">{plan.key} · {plan.active?"ativo":"inativo"}</div>{plan.description?<p className="muted">{plan.description}</p>:null}</div>)}</div>
      {canManage?<form action={platformPlanAction} style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:12 }}><input name="key" placeholder="plan-key" required/><input name="name" placeholder="Nome" required/><input name="description" placeholder="Descrição"/><input name="position" type="number" defaultValue="40"/><label><input type="checkbox" name="active" defaultChecked/> ativo</label><button>Salvar plano</button></form>:null}
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Features por plano</h2>
      <div className="muted" style={{ marginBottom:10 }}>RBAC não é alterado aqui; esta matriz controla apenas entitlement comercial.</div>
      {canManage?<form action={platformPlanFeatureAction} style={{ display:"flex",gap:8,flexWrap:"wrap" }}><select name="planId">{data.plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><select name="featureId">{data.features.map(feature=><option key={feature.id} value={feature.id}>{feature.key}</option>)}</select><input name="limitValue" type="number" min="0" placeholder="limite vazio=ilimitado"/><label><input name="enabled" type="checkbox" defaultChecked/> habilitada</label><button>Aplicar</button></form>:null}
      <div style={{ display:"grid",gap:6,marginTop:12 }}>{data.planFeatures.map(row=><div key={`${row.plan_id}:${row.feature_id}`} className="muted">{planById.get(row.plan_id)?.name??row.plan_id} · {data.features.find(feature=>feature.id===row.feature_id)?.key??row.feature_id} · {row.enabled?"on":"off"}{row.limit_value!==null?` · limite ${row.limit_value}`:""}</div>)}</div>
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Organizações e assinaturas</h2>
      <div style={{ display:"grid",gap:8 }}>{data.organizations.map(org=>{ const subscription=subscriptionByOrg.get(org.id); const plan=subscription?planById.get(subscription.plan_id):null; return <div key={org.id} className="card" style={{ padding:12,background:"var(--surface-2)" }}><strong>{org.name}</strong><div className="muted">Empresa: {org.status} · Plano: {plan?.name??"sem assinatura"} · Assinatura: {subscription?.status??"—"}</div>{canManage?<form action={platformSubscriptionAction} style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:8 }}><input type="hidden" name="organizationId" value={org.id}/><select name="planKey">{data.plans.filter(item=>item.active).map(item=><option key={item.id} value={item.key}>{item.name}</option>)}</select><select name="status"><option value="trialing">trialing</option><option value="active">active</option><option value="past_due">past_due</option><option value="cancelled">cancelled</option><option value="expired">expired</option></select><select name="billingInterval"><option value="month">mensal</option><option value="year">anual</option><option value="manual">manual</option></select><input name="periodEnd" type="datetime-local"/><input name="trialEndsAt" type="datetime-local"/><input name="graceEndsAt" type="datetime-local"/><label><input type="checkbox" name="cancelAtPeriodEnd"/> cancelar no fim</label><input name="idempotencyKey" defaultValue={`platform-${org.id}-${Date.now()}`} required/><button>Aplicar assinatura</button></form>:null}</div>; })}</div>
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Catálogo de integrações</h2>
      <div style={{ display:"grid",gap:6 }}>{data.catalog.map(item=><div key={item.id}><strong>{item.display_name}</strong> <span className="muted">· {item.adapter_key} · {item.kind} · {item.active?"ativo":"inativo"}</span></div>)}</div>
      {canManage?<form action={platformIntegrationCatalogAction} style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:12 }}><input name="adapterKey" placeholder="provider.adapter" required/><select name="kind"><option value="payment">payment</option><option value="whatsapp">whatsapp</option><option value="marketplace">marketplace</option><option value="fiscal">fiscal</option><option value="delivery">delivery</option><option value="generic">generic</option><option value="billing">billing</option></select><input name="displayName" placeholder="Nome" required/><input name="description" placeholder="Descrição"/><input name="position" type="number" defaultValue="0"/><label><input type="checkbox" name="active" defaultChecked/> ativo</label><button>Publicar adapter</button></form>:null}
    </section>

    <section className="card" style={{ padding:18 }}><h2 style={{ marginTop:0 }}>Saúde de billing</h2>
      {data.webhooks.length===0?<p className="muted">Nenhum webhook recebido.</p>:<div style={{ display:"grid",gap:6 }}>{data.webhooks.map(item=><div key={item.id} className="muted"><strong>{item.provider_key}</strong> · {item.external_event_id} · {item.status}{item.error_message?` · ${item.error_message}`:""}</div>)}</div>}
    </section>
  </main>;
}
