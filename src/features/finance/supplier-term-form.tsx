"use client";

import { useActionState } from "react";
import { updateSupplierTermAction } from "@/features/finance/supplier-term-action";
import type { FinanceActionState } from "@/features/finance/actions";

const initial:FinanceActionState={ ok:false,message:null,error:null };
const inputStyle:React.CSSProperties={ minHeight:38,borderRadius:9,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)",padding:"7px 9px",width:"100%" };

export function SupplierPaymentTermForm({ supplierId,days }:{ supplierId:string;days:number }){
  const [state,action,pending]=useActionState(updateSupplierTermAction,initial);
  return <form action={action} style={{ display:"grid",gridTemplateColumns:"minmax(100px,130px) auto",gap:7,alignItems:"end" }}>
    <input type="hidden" name="supplierId" value={supplierId}/><label><span className="muted" style={{ fontSize:10 }}>PRAZO (DIAS)</span><input name="paymentTermDays" type="number" min={0} max={3650} defaultValue={days} aria-label="Prazo de pagamento do fornecedor em dias" style={inputStyle}/></label><button disabled={pending} style={{ minHeight:38,border:0,borderRadius:9,background:"var(--surface-3,#333)",color:"var(--text)",fontWeight:800,padding:"7px 10px" }}>{pending?"Salvando…":"Salvar prazo"}</button>{state.error?<span style={{ color:"#f97066",fontSize:11,gridColumn:"1 / -1" }}>{state.error}</span>:state.message?<span style={{ color:"#22c55e",fontSize:11,gridColumn:"1 / -1" }}>{state.message}</span>:null}
  </form>;
}
