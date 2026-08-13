export type BillingProviderContext={
  providerKey:string;
  secret:string|null;
  config:Record<string,unknown>;
};

export type BillingCheckoutInput={ organizationId:string;planKey:string;successUrl:string;cancelUrl:string;customerEmail?:string|null };
export type BillingPortalInput={ organizationId:string;providerCustomerId:string;returnUrl:string };

export type BillingWebhookEvent={
  externalEventId:string;
  organizationId:string;
  planKey:string;
  status:"trialing"|"active"|"past_due"|"cancelled"|"expired";
  billingInterval?:"month"|"year"|"manual";
  currentPeriodStart?:string|null;
  currentPeriodEnd?:string|null;
  trialEndsAt?:string|null;
  graceEndsAt?:string|null;
  cancelAtPeriodEnd?:boolean;
  providerCustomerId?:string|null;
  providerSubscriptionId?:string|null;
  metadata?:Record<string,unknown>;
};

export interface BillingProvider{
  readonly key:string;
  createCheckout(input:BillingCheckoutInput,context:BillingProviderContext):Promise<{ url:string;providerSessionId?:string|null }>;
  createPortal(input:BillingPortalInput,context:BillingProviderContext):Promise<{ url:string }>;
  verifyWebhook(rawBody:string,headers:Headers,context:BillingProviderContext):Promise<boolean>|boolean;
  parseWebhook(rawBody:string,headers:Headers,context:BillingProviderContext):Promise<BillingWebhookEvent[]>|BillingWebhookEvent[];
}

export type BillingProviderResolver=(providerKey:string)=>BillingProvider|null;

export function resolveBillingSecret(secretRef:string|null|undefined){
  if(!secretRef) return null;
  return process.env[secretRef]??null;
}
