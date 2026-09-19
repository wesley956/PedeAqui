import type { StoreHourInput } from "@/server/menu/schemas";

export type SchedulePeriod = Pick<StoreHourInput, "weekday" | "opensAt" | "closesAt" | "closesNextDay">;
export type PublicHour = {
  weekday: number;
  opens_at: string;
  closes_at: string;
  closes_next_day: boolean;
};

function minutes(clock: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) throw new Error("Invalid clock value");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour * 60 + minute;
}

function toInterval(period: SchedulePeriod) {
  const start = period.weekday * 1440 + minutes(period.opensAt);
  let end = period.weekday * 1440 + minutes(period.closesAt);
  if (period.closesNextDay) end += 1440;
  return { start, end };
}

export function assertNoScheduleOverlap(periods: SchedulePeriod[]) {
  const week = 7 * 1440;
  const originals = periods.map(toInterval);

  for (let i = 0; i < originals.length; i += 1) {
    const a = originals[i];
    if (!a) continue;
    for (let j = i + 1; j < originals.length; j += 1) {
      const b = originals[j];
      if (!b) continue;
      const candidates = [
        b,
        { start: b.start + week, end: b.end + week },
        { start: b.start - week, end: b.end - week },
      ];
      if (candidates.some((candidate) => a.start < candidate.end && candidate.start < a.end)) {
        throw new Error("Store hours overlap");
      }
    }
  }
}

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const weekdayLabels = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export function localClock(timeZone: string, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value])) as Record<string, string>;
  const weekday = parts.weekday ?? "Sun";
  const hour = Number(parts.hour ?? "0");
  const minute = Number(parts.minute ?? "0");
  return {
    weekday: weekdayMap[weekday] ?? 0,
    minuteOfDay: hour * 60 + minute,
  };
}

export function isOpenAt(hours: PublicHour[], timeZone: string, now = new Date()) {
  if (hours.length === 0) return false;
  const local = localClock(timeZone, now);
  const previousDay = (local.weekday + 6) % 7;

  for (const period of hours) {
    const open = minutes(period.opens_at);
    const close = minutes(period.closes_at);

    if (period.weekday === local.weekday) {
      if (!period.closes_next_day && local.minuteOfDay >= open && local.minuteOfDay < close) return true;
      if (period.closes_next_day && local.minuteOfDay >= open) return true;
    }

    if (period.weekday === previousDay && period.closes_next_day && local.minuteOfDay < close) return true;
  }
  return false;
}

export type NextOpening = {
  weekday: number;
  opensAt: string;
  daysAhead: number;
  label: string;
};

export function nextOpening(hours: PublicHour[], timeZone: string, now = new Date()): NextOpening | null {
  if (hours.length === 0) return null;
  const local = localClock(timeZone, now);
  let best: { period: PublicHour; daysAhead: number; distanceMinutes: number } | null = null;

  for (const period of hours) {
    let daysAhead = (period.weekday - local.weekday + 7) % 7;
    const open = minutes(period.opens_at);
    if (daysAhead === 0 && open <= local.minuteOfDay) daysAhead = 7;
    const distanceMinutes = daysAhead * 1440 + open - local.minuteOfDay;
    if (distanceMinutes <= 0) continue;
    if (!best || distanceMinutes < best.distanceMinutes) best = { period, daysAhead, distanceMinutes };
  }

  if (!best) return null;
  const clock = best.period.opens_at.slice(0, 5);
  const dayLabel = best.daysAhead === 0
    ? "hoje"
    : best.daysAhead === 1
      ? "amanhã"
      : weekdayLabels[best.period.weekday] ?? "em breve";
  return {
    weekday: best.period.weekday,
    opensAt: clock,
    daysAhead: best.daysAhead,
    label: `${dayLabel} às ${clock}`,
  };
}
