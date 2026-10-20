import "server-only";

/**
 * Caches curtos em memória para as rotas chamadas em loop pelo Print Agent.
 *
 * O PedeAqui roda como um único processo Node (VPS), então estes caches
 * evitam consultas repetidas ao Supabase a cada poll (claim a cada ~5s e
 * order-alerts a cada ~6s por computador) sem mudar o protocolo do agente.
 *
 * Os TTLs são propositalmente curtos: nenhum deles atrasa impressão ou alerta
 * de pedido novo — só reaproveitam respostas que quase nunca mudam.
 */

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly generations = new Map<string, number>();
  private generation(key: string) { return this.generations.get(key) ?? 0; }
  private bump(key: string) { this.generations.set(key, this.generation(key) + 1); }

  constructor(private readonly ttlMs: number, private readonly maxEntries = 2000) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()) {
    if (this.entries.size >= this.maxEntries) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.expiresAt <= now) this.entries.delete(entryKey);
      }
      if (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        if (oldest !== undefined) this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  delete(key: string) {
    this.bump(key);
    this.entries.delete(key);
    this.inflight.delete(key);
  }

  deleteWhere(predicate: (value: T, key: string) => boolean) {
    for (const [key, entry] of this.entries) {
      if (predicate(entry.value, key)) this.delete(key);
    }
  }

  clear() {
    for (const key of new Set([...this.entries.keys(), ...this.inflight.keys()])) this.bump(key);
    this.entries.clear();
    this.inflight.clear();
  }

  /** Retorna do cache ou executa `load` uma única vez (requisições simultâneas compartilham a mesma promessa). */
  async getOrLoad(key: string, load: () => Promise<T>, shouldCache: (value: T) => boolean = () => true): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const generation = this.generation(key);
    let promise: Promise<T>;
    promise = load()
      .then((value) => {
        // Uma resposta iniciada antes de uma invalidação não pode ressuscitar dados obsoletos.
        if (generation === this.generation(key) && shouldCache(value)) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }
}

/** Throttle simples: retorna true no máximo uma vez a cada `intervalMs` por chave. */
export class KeyedThrottle {
  private readonly lastRun = new Map<string, number>();

  constructor(private readonly intervalMs: number, private readonly maxEntries = 2000) {}

  shouldRun(key: string, now = Date.now()) {
    const last = this.lastRun.get(key);
    if (last !== undefined && now - last < this.intervalMs) return false;
    if (this.lastRun.size >= this.maxEntries) this.lastRun.clear();
    this.lastRun.set(key, now);
    return true;
  }

  reset(key?: string) {
    if (key === undefined) this.lastRun.clear();
    else this.lastRun.delete(key);
  }
}

function envMs(name: string, fallback: number, min: number, max: number) {
  const value = process.env[name];
  if (value === "0") return 0; // permite desligar o cache/throttle sem novo deploy de código
  const raw = Number(value);
  if (!value || !Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/** Validação do token do agente: 30s. Token rotacionado é invalidado na hora (ver PrintAgentAdminService.reconnect). */
export const agentAuthCacheTtlMs = envMs("PEDEAQUI_PRINT_AGENT_AUTH_CACHE_MS", 30_000, 0, 120_000);
/** Limpeza de trabalhos esgotados: no máximo 1x por minuto por agente (antes rodava a cada claim). */
export const exhaustedJobsSweepIntervalMs = envMs("PEDEAQUI_PRINT_EXHAUSTED_SWEEP_MS", 60_000, 0, 600_000);
/** Presença do painel/preferência de som para alertas nativos: 10s (a presença já tem TTL de 90s). */
export const orderAlertStatusCacheTtlMs = envMs("PEDEAQUI_ORDER_ALERT_STATUS_CACHE_MS", 10_000, 0, 60_000);
