const localPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

function parseLocal(value: string): DateParts {
  const match = localPattern.exec(value);
  if (!match) throw new Error("Invalid scheduled local date");
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]),
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() !== parts.month - 1 || check.getUTCDate() !== parts.day
    || check.getUTCHours() !== parts.hour || check.getUTCMinutes() !== parts.minute) {
    throw new Error("Invalid scheduled local date");
  }
  return parts;
}

function partsAt(date: Date, timeZone: string): DateParts {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute),
  };
}

function asUtc(parts: DateParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function zonedLocalDateTimeToUtc(value: string, timeZone: string) {
  const target = parseLocal(value);
  const targetMs = asUtc(target);
  let instantMs = targetMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    instantMs += targetMs - asUtc(partsAt(new Date(instantMs), timeZone));
  }
  const instant = new Date(instantMs);
  const roundTrip = partsAt(instant, timeZone);
  if (asUtc(roundTrip) !== targetMs) throw new Error("Scheduled time does not exist in store timezone");
  return instant;
}

export function localDateTimeInputValue(date: Date, timeZone: string) {
  const parts = partsAt(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function assertScheduledWindow(scheduledFor: Date, now = new Date()) {
  const timestamp = scheduledFor.getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Invalid scheduled time");
  if (timestamp < now.getTime() + 15 * 60_000) throw new Error("Scheduled time must be at least 15 minutes ahead");
  if (timestamp > now.getTime() + 7 * 24 * 60 * 60_000) throw new Error("Scheduled time is too far ahead");
  return scheduledFor;
}
