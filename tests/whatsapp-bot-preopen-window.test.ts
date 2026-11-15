import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { isWithinBotPreopenWindow, botPreopenOpeningTime } from "@/server/conversations/bot-preopen-window";

const hours = [
  { weekday: 0, opens_at: "19:00:00", active: true },
  { weekday: 3, opens_at: "19:00:00", active: true },
  { weekday: 4, opens_at: "19:00:00", active: true },
  { weekday: 5, opens_at: "19:00:00", active: true },
  { weekday: 6, opens_at: "19:00:00", active: true },
];
const time = (clock: string) => new Date(`2026-11-14T${clock}-03:00`);
const allowed = (clock: string, minutes = 60) => isWithinBotPreopenWindow({
  now: time(clock), timezone: "America/Sao_Paulo", hours, minutes,
});

describe("early bot start independent of restaurant opening", () => {
  it("answers from 18:00 through 18:59 on opening days only", () => {
    expect(allowed("17:59:59")).toBe(false);
    expect(allowed("18:00:00")).toBe(true);
    expect(allowed("18:59:59")).toBe(true);
    expect(allowed("19:00:00")).toBe(false);
    expect(allowed("23:00:00")).toBe(false);
  });
  it("never starts the bot on days the restaurant is closed", () => {
    expect(isWithinBotPreopenWindow({
      now: new Date("2026-11-16T18:30:00-03:00"),
      timezone: "America/Sao_Paulo", hours, minutes: 60,
    })).toBe(false);
  });
  it("fails closed without configured minutes or valid opening data", () => {
    expect(allowed("18:15:00", 0)).toBe(false);
    expect(allowed("18:15:00", 181)).toBe(false);
    expect(isWithinBotPreopenWindow({
      now: time("18:15:00"), timezone: "America/Sao_Paulo",
      hours: [{ weekday: 6, opens_at: "19:00:00", active: false }], minutes: 60,
    })).toBe(false);
  });
  it("resolves the exact store opening time for the preopen reply", () => {
    const input = { now: time("18:20:00"), timezone: "America/Sao_Paulo", hours, minutes: 60 };
    expect(botPreopenOpeningTime(input)).toBe("19:00");
    expect(botPreopenOpeningTime({ ...input, now: time("17:59:00") })).toBeNull();
    expect(botPreopenOpeningTime({ ...input, now: time("19:00:00") })).toBeNull();
  });
  it("sends a preopen cardapio notice even when general greeting is disabled", () => {
    const greeting = fs.readFileSync("src/server/conversations/greeting-service.ts", "utf8");
    expect(greeting).toContain('bot_preopen_minutes');
    expect(greeting).toContain('auto:preopen:');
    expect(greeting).toContain('Abrimos às ${opening}!');
    expect(greeting).toContain('Confira nosso cardápio: ${menuUrl}');
    expect(greeting).toContain('Faça seu pedido a partir das 19h!');
    const preopen = greeting.indexOf("const opening = botPreopenOpeningTime");
    const normalGreeting = greeting.indexOf("if (settings.greeting_enabled)");
    expect(preopen).toBeGreaterThan(0);
    expect(preopen).toBeLessThan(normalGreeting);
  });
  it("keeps notifications under the original canSend policy, not the early reply policy", () => {
    const code = fs.readFileSync("src/server/conversations/automation-hours-service.ts", "utf8");
    const send = code.slice(code.indexOf("static async canSend("), code.indexOf("static async canReply("));
    expect(send).not.toContain("bot_preopen_minutes");
    expect(code).toContain("isWithinBotPreopenWindow");
    expect(code).toContain("now.getTime() - inbound.getTime() <= 5 * 60 * 1000");
  });
});
