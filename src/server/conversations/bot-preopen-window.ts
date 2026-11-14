/** Computes the pre-opening bot window in the store's local calendar day.
 * Unlike operational hours, it never opens checkout or order acceptance.
 */
export function isWithinBotPreopenWindow(input: {
  now: Date;
  timezone: string;
  hours: Array<{ weekday: number; opens_at: string; active?: boolean }>;
  minutes: number;
}): boolean {
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 180) return false;
  if (!Number.isFinite(input.now.getTime())) return false;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timezone,
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(input.now);
  } catch {
    return false;
  }
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdays[value("weekday") ?? ""];
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (weekday === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  const localMinute = hour * 60 + minute;
  return input.hours.some((row) => {
    if (row.active === false || row.weekday !== weekday) return false;
    const match = /^(\\d{2}):(\\d{2})(?::\\d{2})?$/.exec(row.opens_at);
    if (!match) return false;
    const opening = Number(match[1]) * 60 + Number(match[2]);
    // Only the same local calendar day's opening; no yesterday or closed-day replies.
    return opening > 0 && localMinute >= opening - input.minutes && localMinute < opening;
  });
}
