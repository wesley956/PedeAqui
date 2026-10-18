/**
 * Hora em que um item "esgotado hoje" volta sozinho: 00:00 do dia seguinte no fuso da loja.
 * Funções puras (sem banco) para poderem ser testadas e usadas na tela.
 */
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

/** Diferença (em minutos) entre o relógio local do fuso e UTC naquele instante. */
function offsetMinutes(date: Date, timeZone: string) {
  const local = localParts(date, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function nextLocalMidnight(timeZone: string, now: Date = new Date()): Date {
  const zone = timeZone || "America/Sao_Paulo";
  const today = localParts(now, zone);
  const guess = Date.UTC(today.year, today.month - 1, today.day + 1, 0, 0, 0);
  const offset = offsetMinutes(new Date(guess), zone);
  return new Date(guess - offset * 60000);
}
