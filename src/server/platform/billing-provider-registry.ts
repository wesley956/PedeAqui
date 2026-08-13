import type { BillingProvider } from "@/server/platform/billing-provider";

const providers=new Map<string,BillingProvider>();

export function registerBillingProvider(provider:BillingProvider){
  if(!provider.key.trim()) throw new Error("Billing provider key is required");
  providers.set(provider.key,provider);
}

export function resolveBillingProvider(providerKey:string){
  return providers.get(providerKey)??null;
}

export function listBillingProviders(){
  return [...providers.keys()].sort();
}
