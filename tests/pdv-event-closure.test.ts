import { describe, expect, it } from "vitest";
import { resolveStoreOperationalStatus, storeClosedOrderMessage } from "@/server/menu/store-operational-status-core";
import { eventCreateSchema } from "@/server/pdv/events/schemas";
import { zonedLocalDateTimeToUtc } from "@/server/checkout/scheduling";
const at = (s: string) => new Date(`2026-11-26T${s}-03:00`);
const baseline = { storeStatus: "active", acceptingOrders: true, timeZone: "America/Sao_Paulo", hours: [{weekday:4,opens_at:"18:00",closes_at:"23:59",closes_next_day:false}] };
const closure = {reason:"Participação em feira",startsAt:at("18:30:00").toISOString(),endsAt:at("22:00:00").toISOString()};
describe("temporary event closure overlay", () => {
  it.each([["18:29:59",true],["18:30:00",false],["21:59:59",false],["22:00:00",true]] as const)("at %s accepts orders: %s", (time,canOrder) => {
    expect(resolveStoreOperationalStatus({...baseline,now:at(time),eventClosure:closure}).canOrder).toBe(canOrder);
  });
  it("tells the bot dates/reason and preserves existing-order/human access", () => {
    const state = resolveStoreOperationalStatus({...baseline,now:at("19:00:00"),eventClosure:closure});
    expect(state.reason).toBe("event_closed");
    const message = storeClosedOrderMessage(state);
    for (const text of ["26/11/2026", "18:30", "22:00",closure.reason,"pedido existente","equipe"]) expect(message).toContain(text);
  });
  it("does not undo a manual pause or other store/schedule blocks after expiration", () => {
    expect(resolveStoreOperationalStatus({...baseline,acceptingOrders:false,now:at("22:00:00"),eventClosure:closure}).reason).toBe("orders_paused");
    expect(resolveStoreOperationalStatus({...baseline,storeStatus:"temporarily_closed",now:at("22:00:00"),eventClosure:closure}).reason).toBe("store_unavailable");
    expect(resolveStoreOperationalStatus({...baseline,hours:[],now:at("22:00:00"),eventClosure:closure}).reason).toBe("closed_hours");
  });
  it("keeps normal-store behavior without any event", () => {
    expect(resolveStoreOperationalStatus({...baseline,now:at("19:00:00")})).toEqual(resolveStoreOperationalStatus({...baseline,now:at("19:00:00"),eventClosure:null}));
  });
  it("interprets event dates in the store timezone, including the overnight date", () => {
    expect(zonedLocalDateTimeToUtc("2026-11-26T23:30","America/Sao_Paulo").toISOString()).toBe("2026-11-27T02:30:00.000Z");
  });
  it("requires an explicit closure reason/period and prevents repeated products", () => {
    const input={id:"86000000-0000-4000-8000-000000000010",name:"Feira",startsLocal:"2026-11-26T18:00",endsLocal:"2026-11-27T00:00",closeStore:false,closureReason:"",items:[{productId:"86000000-0000-4000-8000-000000000004",quantity:1}]};
    expect(eventCreateSchema.safeParse(input).success).toBe(true);
    expect(eventCreateSchema.safeParse({...input,closeStore:true}).success).toBe(false);
    expect(eventCreateSchema.safeParse({...input,items:[...input.items,...input.items]}).success).toBe(false);
  });
});
