import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { KeyedThrottle, TtlCache } = await import("@/server/printing/agent-request-cache");

describe("TtlCache", () => {
  it("reaproveita o valor dentro do TTL e recarrega depois", async () => {
    const cache = new TtlCache<number>(1000);
    let loads = 0;
    const load = async () => ++loads;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      expect(await cache.getOrLoad("a", load)).toBe(1);
      vi.setSystemTime(999);
      expect(await cache.getOrLoad("a", load)).toBe(1);
      vi.setSystemTime(1000);
      expect(await cache.getOrLoad("a", load)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não guarda valores rejeitados por shouldCache (ex.: token inválido)", async () => {
    const cache = new TtlCache<string | null>(60_000);
    let loads = 0;
    const load = async () => { loads += 1; return null; };
    await cache.getOrLoad("x", load, (value) => value !== null);
    await cache.getOrLoad("x", load, (value) => value !== null);
    expect(loads).toBe(2);
  });

  it("compartilha a mesma consulta entre requisições simultâneas", async () => {
    const cache = new TtlCache<number>(60_000);
    let loads = 0;
    const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(++loads), 5));
    const results = await Promise.all([cache.getOrLoad("k", load), cache.getOrLoad("k", load), cache.getOrLoad("k", load)]);
    expect(results).toEqual([1, 1, 1]);
    expect(loads).toBe(1);
  });

  it("não guarda erros", async () => {
    const cache = new TtlCache<number>(60_000);
    await expect(cache.getOrLoad("e", async () => { throw new Error("db"); })).rejects.toThrow("db");
    expect(await cache.getOrLoad("e", async () => 7)).toBe(7);
  });

  it("permite invalidar por predicado e TTL 0 desliga o cache", async () => {
    const cache = new TtlCache<{ id: string }>(60_000);
    cache.set("h1", { id: "agent-1" });
    cache.set("h2", { id: "agent-2" });
    cache.deleteWhere((value) => value.id === "agent-1");
    expect(cache.get("h1")).toBeUndefined();
    expect(cache.get("h2")).toEqual({ id: "agent-2" });

    const disabled = new TtlCache<number>(0);
    let loads = 0;
    await disabled.getOrLoad("z", async () => ++loads);
    await disabled.getOrLoad("z", async () => ++loads);
    expect(loads).toBe(2);
  });
});

describe("KeyedThrottle", () => {
  it("libera no máximo uma execução por intervalo e por chave", () => {
    const throttle = new KeyedThrottle(60_000);
    expect(throttle.shouldRun("agent-1", 0)).toBe(true);
    expect(throttle.shouldRun("agent-1", 30_000)).toBe(false);
    expect(throttle.shouldRun("agent-2", 30_000)).toBe(true);
    expect(throttle.shouldRun("agent-1", 60_000)).toBe(true);
    throttle.reset("agent-1");
    expect(throttle.shouldRun("agent-1", 60_001)).toBe(true);
  });
});

describe("contratos das rotas do Print Agent", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("claim usa a limpeza com throttle, sem atrasar o claim em si", () => {
    const route = read("src/app/api/print-agent/claim/route.ts");
    expect(route).toContain("closeExhaustedPrintJobsThrottled(agent)");
    expect(route).toContain("PrintQueueService.claim(agent");
  });

  it("autenticação do agente usa cache e reconectar invalida o token antigo", () => {
    expect(read("src/server/printing/print-queue-service.ts")).toContain("authenticatedAgentCache.getOrLoad(tokenHash");
    expect(read("src/server/printing/print-agent-admin-service.ts")).toContain("invalidatePrintAgentAuthCache(result.id)");
  });

  it("eventos de pedido novo continuam sem cache; só o status do painel é cacheado", () => {
    const service = read("src/server/orders/order-alert-backup-service.ts");
    expect(service).toContain("agentStatusCache.getOrLoad");
    const pollEvents = service.slice(service.indexOf("static async pollEvents"), service.indexOf("static async pollForAgent"));
    expect(pollEvents).not.toContain("Cache");
  });
});


describe("invalidação durante consultas em andamento", () => {
  it("não recacheia resposta antiga após delete e permite nova consulta", async () => {
    const cache = new TtlCache<string>(60_000);
    let resolveOld!: (value: string) => void;
    const old = cache.getOrLoad("token", () => new Promise<string>((resolve) => { resolveOld = resolve; }));
    cache.delete("token");
    expect(await cache.getOrLoad("token", async () => "novo")).toBe("novo");
    resolveOld("antigo");
    expect(await old).toBe("antigo");
    expect(cache.get("token")).toBe("novo");
  });

  it("clear impede resposta pendente de repovoar o cache", async () => {
    const cache = new TtlCache<string>(60_000);
    let resolveOld!: (value: string) => void;
    const old = cache.getOrLoad("token", () => new Promise<string>((resolve) => { resolveOld = resolve; }));
    cache.clear();
    resolveOld("antigo");
    await old;
    expect(cache.get("token")).toBeUndefined();
  });
});
