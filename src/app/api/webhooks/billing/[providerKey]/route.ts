import { NextResponse } from "next/server";
import { processBillingWebhook } from "@/server/platform/billing-webhook-service";

export async function POST(request:Request,{ params }:{ params:Promise<{ providerKey:string }> }){
  try{
    const contentLength=Number(request.headers.get("content-length")??"0");
    if(contentLength>1_000_000) return NextResponse.json({ error:"Payload too large" },{ status:413 });
    const rawBody=await request.text();
    if(Buffer.byteLength(rawBody,"utf8")>1_000_000) return NextResponse.json({ error:"Payload too large" },{ status:413 });
    const { providerKey }=await params;
    const result=await processBillingWebhook(providerKey,rawBody,request.headers);
    return NextResponse.json({ ok:true,...result });
  }catch(error){
    // Do not log provider payloads, signatures, tokens or raw error messages at the HTTP boundary.
    console.error("billing webhook failed",{ errorType:error instanceof Error?error.name:"UnknownError" });
    return NextResponse.json({ error:"Billing webhook rejected" },{ status:400 });
  }
}
