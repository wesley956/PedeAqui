import Link from "next/link";
import { FinanceReadService } from "@/server/finance/finance-read-service";
import {
  CancelManualFinanceForm,FinanceAccountForm,FinanceCategoryForm,FinanceTransferForm,ManualFinanceEntryForm,
  ReverseSettlementForm,SettleObligationForm,
} from "@/features/finance/finance-forms";
import { SupplierPaymentTermForm } from "@/features/finance/supplier-term-form";

type SearchParams=Promise<{ from?:string;to?:string }>;
type Account={ id:string;name:string;account_type:string;system_key:string|null;balance_cents:number|string };
type Report={
  period:{ from:string;to:string;today:string;timezone:string };
  accounts:Account[];
  obligations:{ receivable_open_cents:number|string;payable_open_cents:number|string;receivable_overdue_cents:number|string;payable_overdue_cents:number|string;open_count:number|string };
  dre:{ gross_revenue:number|string;deductions:number|string;delivery_revenue:number|string;cogs:number|string;operating_expense:number|string;other_revenue:number|string;other_expense:number|string;net_result:number|string };
  cashflow:{ net_realized_cents:number|string;daily:Array<{ day:string;net_cents:number|string }> };
};
const statusLabel:Record<string,string>={ open:"Em aberto",partially_settled:"Parcial",settled:"Liquidado",cancelled:"Cancelado" };
function brl(cents:number|string|null|undefined){ return new Intl.NumberFormat("pt-BR",{ style:"currency",currency:"BRL" }).format(Number(cents??0)/100); }
function date(value:string|null|undefined){ if(!value) return "—"; const [y,m,d]=value.slice(0,10).split("-"); return y&&m&&d?`${d}/${m}/${y}`:value; }
function sourceLabel(source:string|null){ const labels:Record<string,string>={ order:"Venda",purchase_receipt:"Compra",supplier_credit:"Crédito fornecedor",manual:"Manual" }; return source?labels[source]??source:"Manual"; }
function accountTypeLabel(type:string){ return ({ cash:"Dinheiro",bank:"Banco",clearing:"Liquidação",wallet:"Carteira",other:"Outra" } as Record<string,string>)[type]??type; }

export default async function FinancePage({ searchParams }:{ searchParams:SearchParams }){
  const query=await searchParams;
  const data=await FinanceReadService.load({ from:query.from??null,to:query.to??null });
  const report=(data.report??null) as Report|null;
  const accounts=data.accounts as Account[];
  const open=data.obligations.filter((ob)=>ob.status==="open"||ob.status==="partially_settled");
  const settlements=data.transactions.filter((tx)=>tx.transaction_type==="settlement");
  const manualSettlements=settlements.filter((tx)=>tx.source_type==="manual_settlement"||tx.source_type==="manual");

  return <section style={{ display:"grid",gap:18,maxWidth:1360 }}>
    <header style={{ display:"flex",justifyContent:"space-between",gap:16,alignItems:"end",flexWrap:"wrap" }}>
      <div><p className="muted" style={{ margin:0 }}>Gestão por competência e liquidação</p><h1 style={{ margin:"3px 0" }}>Financeiro</h1><p className="muted" style={{ margin:0,maxWidth:820 }}>Venda, pagamento, caixa, estoque e compra continuam sendo fontes operacionais. Aqui ficam obrigações, contas, liquidações, fluxo realizado e DRE — sem editar saldo diretamente.</p></div>
      <div style={{ display:"flex",gap:14,flexWrap:"wrap" }}><Link href="/caixa" style={{ color:"var(--accent)",fontWeight:800 }}>Caixa físico</Link><Link href="/compras" style={{ color:"var(--accent)",fontWeight:800 }}>Compras</Link><Link href="/dashboard" style={{ color:"var(--accent)",fontWeight:850 }}>Dashboard →</Link></div>
    </header>

    {data.canReports&&report?<>
      <form method="get" className="card" style={{ padding:12,display:"flex",gap:8,alignItems:"end",flexWrap:"wrap" }}><label><span className="muted" style={{ fontSize:10 }}>DE</span><input name="from" type="date" defaultValue={data.period.from} style={field}/></label><label><span className="muted" style={{ fontSize:10 }}>ATÉ</span><input name="to" type="date" defaultValue={data.period.to} style={field}/></label><button style={button}>Aplicar período</button><span className="muted" style={{ fontSize:11 }}>DRE por competência · fluxo por liquidação · {data.store.timezone}</span></form>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10 }}>
        <Metric label="Resultado DRE" value={brl(report.dre.net_result)} tone={Number(report.dre.net_result)<0?"bad":"good"}/>
        <Metric label="Fluxo realizado" value={brl(report.cashflow.net_realized_cents)}/>
        <Metric label="A receber" value={brl(report.obligations.receivable_open_cents)} warning={Number(report.obligations.receivable_overdue_cents)>0}/>
        <Metric label="A pagar" value={brl(report.obligations.payable_open_cents)} warning={Number(report.obligations.payable_overdue_cents)>0}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:12 }}>
        <article className="card" style={{ padding:16 }}><h2 style={{ margin:"0 0 12px",fontSize:18 }}>DRE gerencial</h2><Rows rows={[
          ["Receita bruta",report.dre.gross_revenue],["Deduções e reembolsos",report.dre.deductions],["Receita de entrega",report.dre.delivery_revenue],
          ["CPV",report.dre.cogs],["Despesas operacionais",report.dre.operating_expense],["Outras receitas",report.dre.other_revenue],["Outras despesas",report.dre.other_expense],
        ]}/><div style={{ display:"flex",justifyContent:"space-between",borderTop:"2px solid var(--border)",paddingTop:10,marginTop:8,fontWeight:900 }}><span>Resultado</span><span>{brl(report.dre.net_result)}</span></div></article>
        <article className="card" style={{ padding:16 }}><h2 style={{ margin:"0 0 12px",fontSize:18 }}>Vencimentos</h2><Rows rows={[["Recebíveis em aberto",report.obligations.receivable_open_cents],["Recebíveis vencidos",report.obligations.receivable_overdue_cents],["Pagáveis em aberto",report.obligations.payable_open_cents],["Pagáveis vencidos",report.obligations.payable_overdue_cents]]}/><p className="muted" style={{ fontSize:11,margin:"12px 0 0" }}>Vencido é uma leitura derivada pela data local da unidade; o ledger histórico não é reescrito para trocar status.</p></article>
      </div>
    </>:<article className="card" style={{ padding:16 }}><strong>Visão operacional</strong><p className="muted" style={{ margin:"5px 0 0",fontSize:12 }}>Você tem `finance.view`, mas não `finance.reports`; DRE e fluxo de caixa ficam ocultos.</p></article>}

    <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:10 }}>
      {accounts.map((account)=><article key={account.id} className="card" style={{ padding:14 }}><span className="muted" style={{ fontSize:10 }}>{accountTypeLabel(account.account_type).toUpperCase()}</span><strong style={{ display:"block",fontSize:16,marginTop:3 }}>{account.name}</strong><strong style={{ display:"block",fontSize:23,marginTop:9,color:Number(account.balance_cents)<0?"#f97066":undefined }}>{brl(account.balance_cents)}</strong>{account.system_key?<span className="muted" style={{ fontSize:9 }}>Conta técnica · {account.system_key}</span>:null}</article>)}
    </div>

    {(data.canManage||data.canSettle)?<div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:12,alignItems:"start" }}>
      {data.canManage?<article className="card" style={{ padding:16,display:"grid",gap:10 }}><h2 style={{ margin:0,fontSize:18 }}>Novo lançamento</h2><p className="muted" style={{ margin:0,fontSize:11 }}>Competência afeta a DRE. Escolher uma conta também liquida imediatamente; sem conta, vira recebível/pagável em aberto.</p><ManualFinanceEntryForm categories={data.categories} accounts={accounts} today={data.period.today} canSettle={data.canSettle}/></article>:null}
      {data.canSettle?<article className="card" style={{ padding:16,display:"grid",gap:10 }}><h2 style={{ margin:0,fontSize:18 }}>Transferir entre contas</h2><p className="muted" style={{ margin:0,fontSize:11 }}>Transferência é um par atômico e não entra na DRE.</p><FinanceTransferForm accounts={accounts}/></article>:null}
      {data.canManage?<article className="card" style={{ padding:16,display:"grid",gap:10 }}><h2 style={{ margin:0,fontSize:18 }}>Configuração</h2><details><summary style={{ cursor:"pointer",fontWeight:800 }}>Criar conta</summary><div style={{ marginTop:8 }}><FinanceAccountForm/></div></details><details><summary style={{ cursor:"pointer",fontWeight:800 }}>Criar categoria</summary><div style={{ marginTop:8 }}><FinanceCategoryForm categories={data.categories}/></div></details></article>:null}
    </div>:null}

    {data.canManage&&data.suppliers.some((s)=>s.config?.active)?<article className="card" style={{ padding:16,display:"grid",gap:10 }}><div><h2 style={{ margin:0,fontSize:18 }}>Prazo financeiro de fornecedores</h2><p className="muted" style={{ margin:"4px 0 0",fontSize:11 }}>Novos pedidos de compra guardam esse prazo como snapshot; alterar aqui não muda compras antigas.</p></div><div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:8 }}>{data.suppliers.filter((s)=>s.config?.active).map((supplier)=><div key={supplier.id} style={{ border:"1px solid var(--border)",borderRadius:10,padding:10 }}><strong style={{ display:"block",marginBottom:7 }}>{supplier.name}</strong><SupplierPaymentTermForm supplierId={supplier.id} days={supplier.config?.payment_term_days??0}/></div>)}</div></article>:null}

    <article className="card" style={{ padding:16,display:"grid",gap:10 }}><div><h2 style={{ margin:0,fontSize:18 }}>Recebíveis e pagáveis</h2><p className="muted" style={{ margin:"4px 0 0",fontSize:11 }}>Venda é liquidada pelo módulo Pagamentos. Compras, créditos de fornecedor e lançamentos manuais podem ser liquidados aqui conforme permissão.</p></div>{open.length===0?<p className="muted" style={{ margin:0 }}>Nenhuma obrigação em aberto.</p>:<div style={{ display:"grid",gap:8 }}>{open.map((ob)=><div key={ob.id} style={{ borderTop:"1px solid var(--border)",paddingTop:9,display:"grid",gap:7 }}><div style={{ display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}><div><strong>{ob.description}</strong><div className="muted" style={{ fontSize:10 }}>{sourceLabel(ob.source_type)} · competência {date(ob.competence_date)} · vencimento {date(ob.due_date)}</div></div><div style={{ textAlign:"right" }}><strong style={{ color:ob.direction==="in"?"#22c55e":"#f59e0b" }}>{ob.direction==="in"?"A receber":"A pagar"} · {brl(ob.open_cents)}</strong><div className="muted" style={{ fontSize:10 }}>{statusLabel[ob.status]??ob.status} · principal {brl(ob.principal_cents)} · liquidado {brl(ob.settled_cents)}</div></div></div>{data.canSettle&&ob.source_type!=="order"?<details><summary style={{ cursor:"pointer",fontWeight:800,fontSize:12 }}>Liquidar</summary><div style={{ marginTop:7 }}><SettleObligationForm obligationId={ob.id} openCents={ob.open_cents} accounts={accounts}/></div></details>:null}{data.canManage&&ob.source_type==="manual"&&Number(ob.settled_cents)===0?<details><summary style={{ cursor:"pointer",fontWeight:800,fontSize:12 }}>Cancelar lançamento manual</summary><div style={{ marginTop:7 }}><CancelManualFinanceForm obligationId={ob.id}/></div></details>:null}</div>)}</div>}</article>

    <article className="card" style={{ padding:16,display:"grid",gap:10 }}><div><h2 style={{ margin:0,fontSize:18 }}>Movimentos recentes</h2><p className="muted" style={{ margin:"4px 0 0",fontSize:11 }}>O ledger é imutável. Estorno cria novo lançamento; não edita o original.</p></div>{data.transactions.length===0?<p className="muted" style={{ margin:0 }}>Sem movimentos financeiros.</p>:data.transactions.slice(0,80).map((tx)=><div key={tx.id} style={{ borderTop:"1px solid var(--border)",paddingTop:7,display:"grid",gap:5 }}><div style={{ display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",fontSize:12 }}><span><strong>{tx.description||tx.transaction_type}</strong><span className="muted"> · {tx.source_type||"financeiro"} · {new Date(tx.occurred_at).toLocaleString("pt-BR")}</span></span><strong style={{ color:tx.direction==="in"?"#22c55e":"#f97066" }}>{tx.effect_sign<0?"estorno ":""}{tx.direction==="in"?"+":"−"}{brl(tx.amount_cents)}</strong></div>{data.canSettle&&tx.transaction_type==="settlement"&&(tx.source_type==="manual_settlement"||tx.source_type==="manual")?<details><summary style={{ cursor:"pointer",fontSize:11,fontWeight:800 }}>Estornar liquidação manual</summary><div style={{ marginTop:6 }}><ReverseSettlementForm transactionId={tx.id}/></div></details>:null}</div>)}</article>
  </section>;
}

const field:React.CSSProperties={ minHeight:38,borderRadius:9,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)",padding:"7px 9px" };
const button:React.CSSProperties={ minHeight:38,border:0,borderRadius:9,background:"var(--accent)",color:"#fff",padding:"7px 12px",fontWeight:850 };
function Metric({ label,value,warning=false,tone }:{ label:string;value:string;warning?:boolean;tone?:"good"|"bad" }){ const color=tone==="good"?"#22c55e":tone==="bad"?"#f97066":warning?"#f59e0b":undefined; return <article className="card" style={{ padding:14 }}><span className="muted" style={{ fontSize:10 }}>{label.toUpperCase()}</span><strong style={{ display:"block",fontSize:24,marginTop:3,color }}>{value}</strong></article>; }
function Rows({ rows }:{ rows:Array<[string,number|string]> }){ return <div style={{ display:"grid",gap:7 }}>{rows.map(([label,value])=><div key={label} style={{ display:"flex",justifyContent:"space-between",gap:10,fontSize:12 }}><span className="muted">{label}</span><strong>{brl(value)}</strong></div>)}</div>; }
