import { NextResponse } from "next/server";
import { getRequestContext } from "@/server/observability/request-context";
import { recordFailure } from "@/server/observability/failure";
import { processBillingWebhook } from "@/server/platform/billing-webhook-service";

export async function POST(request:Request,{ params }:{ params:Promise<{ providerKey:string }> }){
  const requestContext=await getRequestContext();
  const responseHeaders={"x-request-id":requestContext.requestId};
  try{
    const contentLength=Number(request.headers.get("content-length")??"0");
    if(contentLength>1_000_000) return NextResponse.json({ error:"Payload too large",requestId:requestContext.requestId },{ status:413,headers:responseHeaders });
    const rawBody=await request.text();
    if(Buffer.byteLength(rawBody,"utf8")>1_000_000) return NextResponse.json({ error:"Payload too large",requestId:requestContext.requestId },{ status:413,headers:responseHeaders });
    const { providerKey }=await params;
    const result=await processBillingWebhook(providerKey,rawBody,request.headers);
    return NextResponse.json({ ok:true,...result,requestId:requestContext.requestId },{ headers:responseHeaders });
  }catch(error){
    const failure=recordFailure("billing.webhook.failed",error,{requestId:requestContext.requestId});
    return NextResponse.json(
      { error:failure.retryable?"Billing webhook temporarily unavailable":"Billing webhook rejected",requestId:requestContext.requestId },
      { status:failure.retryable?503:400,headers:responseHeaders },
    );
  }
}
