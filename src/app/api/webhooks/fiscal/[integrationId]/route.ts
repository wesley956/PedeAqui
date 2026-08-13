import { FiscalWebhookService } from "@/server/fiscal/fiscal-webhook-service";
import { resolveFiscalProvider } from "@/server/fiscal/fiscal-provider-registry";

export const runtime="nodejs";

type Params=Promise<{ integrationId:string }>;

export async function POST(request:Request,{ params }:{ params:Params }){
  const contentLength=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(contentLength)&&contentLength>1_000_000) return new Response("Payload too large",{ status:413 });
  const rawBody=await request.text(); if(rawBody.length>1_000_000) return new Response("Payload too large",{ status:413 });
  const { integrationId }=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(integrationId)) return new Response("Invalid integration",{ status:400 });
  try{
    const result=await FiscalWebhookService.ingest(integrationId,rawBody,request.headers,resolveFiscalProvider);
    return Response.json({ ok:true,...result });
  }catch(error){
    const message=error instanceof Error?error.message:"Fiscal webhook failed";
    if(message.includes("not registered")||message.includes("does not support")) return new Response("Fiscal provider unavailable",{ status:503 });
    if(message.includes("Invalid fiscal webhook signature")||message.includes("secret is not configured")) return new Response("Invalid signature",{ status:401 });
    if(message.includes("replay payload mismatch")) return new Response("Webhook replay mismatch",{ status:409 });
    return new Response("Fiscal webhook processing failed",{ status:500 });
  }
}
