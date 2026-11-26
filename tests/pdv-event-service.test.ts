import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({rpc: mock.rpc}) }));
vi.mock("@/server/access/authorize", () => ({ authorize: mock.authorize }));
import { PdvEventService } from "@/server/pdv/events/event-service";
const eventId="86000000-0000-4000-8000-000000000010",productId="86000000-0000-4000-8000-000000000004";
beforeEach(() => {mock.rpc.mockReset().mockResolvedValue({data:eventId,error:null});mock.authorize.mockReset().mockResolvedValue({organizationId:"org-a",storeId:"store-a",userId:"actor",timezone:"America/Sao_Paulo"});});
describe("PDV event management permissions and timezone", () => {
  it("requires store-management plus sale permission; scopes every RPC from the authenticated session", async () => {
    await PdvEventService.create({id:eventId,name:"Feira",startsLocal:"2026-11-26T18:00",endsLocal:"2026-11-27T00:00",closeStore:true,closureReason:"Participação em feira",closureStartsLocal:"2026-11-26T19:00",closureEndsLocal:"2026-11-26T23:00",items:[{productId,quantity:3}]},"create-test-event");
    expect(mock.authorize).toHaveBeenCalledWith("orders.create");
    expect(mock.authorize).toHaveBeenCalledWith("stores.manage",expect.objectContaining({organizationId:"org-a"}));
    expect(mock.rpc).toHaveBeenLastCalledWith("pdv_event_manage_internal",expect.objectContaining({p_organization_id:"org-a",p_store_id:"store-a",p_actor_user_id:"actor",p_event_id:eventId,p_data:expect.objectContaining({starts_at:"2026-11-26T21:00:00.000Z",ends_at:"2026-11-27T03:00:00.000Z",closure_starts_at:"2026-11-26T22:00:00.000Z",items:[{product_id:productId,quantity:3}]})}));
  });
  it("rejects operator management before making a service-role RPC", async () => {
    mock.authorize.mockImplementation(async permission => {if(permission === "stores.manage")throw new Error("denied");return {organizationId:"org-a",storeId:"store-a"}});
    await expect(PdvEventService.restock(eventId,[{productId,quantity:3}],"restock-123")).rejects.toThrow("denied");expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a closure outside the event rather than silently changing store hours", async () => {
    await expect(PdvEventService.create({id:eventId,name:"Feira",startsLocal:"2026-11-26T18:00",endsLocal:"2026-11-26T23:00",closeStore:true,closureReason:"Feira",closureStartsLocal:"2026-11-26T17:00",closureEndsLocal:"2026-11-26T23:00",items:[{productId,quantity:3}]},"create-test-event")).rejects.toThrow("dentro");expect(mock.rpc).not.toHaveBeenCalled();
  });
});
