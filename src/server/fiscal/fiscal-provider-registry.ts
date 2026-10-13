import type { FiscalProvider } from "@/server/fiscal/fiscal-provider";
import { FocusNfeProvider } from "@/server/fiscal/providers/focus-nfe";

// Providers are registered explicitly in code. Database configuration chooses among
// adapters that the application actually ships; it can never load arbitrary code.
const providers = new Map<string,FiscalProvider>();

function register(provider:FiscalProvider){ providers.set(provider.key,provider); }

register(new FocusNfeProvider());

export function resolveFiscalProvider(providerKey:string){ return providers.get(providerKey)??null; }

export function fiscalProviderKeys(){ return [...providers.keys()]; }
