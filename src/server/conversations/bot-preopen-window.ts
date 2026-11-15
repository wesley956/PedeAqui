/** Computes the pre-opening bot window in the store's local calendar day.
 * Unlike operational hours, it never opens checkout or order acceptance.
 */
export function botPreopenOpeningTime(input: {
  now: Date;
  timezone: string;
  hours: Array<{ weekday: number; opens_at: string; active?: boolean }>;
  minutes: number;
}): string | null {
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 180) return null;
  if (!Number.isFinite(input.now.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timezone,
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(input.now);
  } catch {
    return null;
  }
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdays[value("weekday") ?? ""];
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (weekday === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const localMinute = hour * 60 + minute;
  for (const row of input.hours) {
    if (row.active === false || row.weekday !== weekday) return null;
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(row.opens_at);
    if (!match) return null;
    const opening = Number(match[1]) * 60 + Number(match[2]);
    // Only the same local calendar day's opening; no yesterday or closed-day replies.
    if (opening > 0 && localMinute >= opening - input.minutes && localMinute < opening) {
      return row.opens_at.slice(0, 5);
    }
  }
  return null;
}

export function isWithinBotPreopenWindow(input: Parameters<typeof botPreopenOpeningTime>[0]): boolean {
  return botPreopenOpeningTime(input) !== null;
}
