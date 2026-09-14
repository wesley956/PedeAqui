import { z } from "zod";
import type { IdentitySource, IdentityTrustLevel } from "@/server/intelligence/context";

const uuid = z.string().uuid();
const scopeSchema = z.object({ organizationId: uuid, storeId: uuid });

export type IdentityScope = z.infer<typeof scopeSchema>;

export type ResolvedCustomerIdentity = IdentityScope & {
  source: IdentitySource;
  trust: IdentityTrustLevel;
  customerId: string | null;
  contactId: string | null;
  userId: string | null;
};

export type CustomerIdentityPorts = {
  resolveBrowserRecognition(input: IdentityScope & { token: string }): Promise<{ customerId: string } | null>;
  resolveWhatsAppContact(input: IdentityScope & { contactId: string }): Promise<{ customerId: string | null } | null>;
  resolveAuthenticatedUser(input: IdentityScope & { userId: string }): Promise<{ authorized: boolean }>;
  resolveManualAuthorizedLink(input: IdentityScope & { customerId: string; actorUserId: string }): Promise<{ authorized: boolean }>;
};

export class CustomerIdentityResolver {
  constructor(private readonly ports: CustomerIdentityPorts) {}

  async fromBrowser(input: IdentityScope & { token: string }): Promise<ResolvedCustomerIdentity> {
    const scope = scopeSchema.parse(input);
    const token = z.string().min(32).max(512).parse(input.token);
    const result = await this.ports.resolveBrowserRecognition({ ...scope, token });
    return result
      ? { ...scope, source: "browser_recognition", trust: "verified", customerId: uuid.parse(result.customerId), contactId: null, userId: null }
      : this.anonymous(scope);
  }

  async fromWhatsAppContact(input: IdentityScope & { contactId: string }): Promise<ResolvedCustomerIdentity> {
    const scope = scopeSchema.parse(input);
    const contactId = uuid.parse(input.contactId);
    const result = await this.ports.resolveWhatsAppContact({ ...scope, contactId });
    if (!result) return this.anonymous(scope, "weak");
    return {
      ...scope,
      source: "whatsapp_contact",
      trust: result.customerId ? "verified" : "weak",
      customerId: result.customerId ? uuid.parse(result.customerId) : null,
      contactId,
      userId: null,
    };
  }

  async fromAuthenticatedUser(input: IdentityScope & { userId: string }): Promise<ResolvedCustomerIdentity> {
    const scope = scopeSchema.parse(input);
    const userId = uuid.parse(input.userId);
    const result = await this.ports.resolveAuthenticatedUser({ ...scope, userId });
    if (!result.authorized) return this.anonymous(scope);
    return { ...scope, source: "authenticated_user", trust: "privileged", customerId: null, contactId: null, userId };
  }

  async fromManualAuthorizedLink(input: IdentityScope & { customerId: string; actorUserId: string }): Promise<ResolvedCustomerIdentity> {
    const scope = scopeSchema.parse(input);
    const customerId = uuid.parse(input.customerId);
    const actorUserId = uuid.parse(input.actorUserId);
    const result = await this.ports.resolveManualAuthorizedLink({ ...scope, customerId, actorUserId });
    if (!result.authorized) return this.anonymous(scope);
    return { ...scope, source: "manual_authorized_link", trust: "privileged", customerId, contactId: null, userId: actorUserId };
  }

  private anonymous(scope: IdentityScope, trust: "none" | "weak" = "none"): ResolvedCustomerIdentity {
    return { ...scope, source: "anonymous", trust, customerId: null, contactId: null, userId: null };
  }
}

