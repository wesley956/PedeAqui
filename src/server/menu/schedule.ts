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
