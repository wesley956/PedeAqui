import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

export type RequestContext = {
  requestId: string;
  userAgent: string | null;
  forwardedFor: string | null;
};

export async function getRequestContext(): Promise<RequestContext> {
  const requestHeaders = await headers();
  const upstreamRequestId = requestHeaders.get("x-request-id")?.trim();

  return {
    requestId: upstreamRequestId && upstreamRequestId.length <= 128 ? upstreamRequestId : randomUUID(),
    userAgent: requestHeaders.get("user-agent"),
    forwardedFor: requestHeaders.get("x-forwarded-for"),
  };
}
