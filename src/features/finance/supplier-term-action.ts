"use server";

import { revalidatePath } from "next/cache";
import { SupplierTermService } from "@/server/finance/supplier-term-service";
import type { FinanceActionState } from "@/features/finance/actions";

export async function updateSupplierTermAction(_previous:FinanceActionState,formData:FormData):Promise<FinanceActionState>{
  try{
    const supplierId=String(formData.get("supplierId")??"").trim();
    const paymentTermDays=Number(String(formData.get("paymentTermDays")??"0").trim());
    await SupplierTermService.update({ supplierId,paymentTermDays });
    revalidatePath("/financeiro"); revalidatePath("/fornecedores"); revalidatePath("/compras");
    return { ok:true,message:"Prazo de pagamento atualizado. Novos pedidos de compra guardarão esse prazo como snapshot.",error:null };
  }catch(error){ return { ok:false,message:null,error:error instanceof Error?error.message:"Não foi possível atualizar o prazo." }; }
}
