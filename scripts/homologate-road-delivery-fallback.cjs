// Run only inside the quality-menu sandbox container.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

async function main() {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321", "Sandbox URL required");
  assert.equal(process.env.GEOAPIFY_PILOT_STORE_ID, "d0000000-0000-4000-8000-000000000011", "Quality-menu pilot required");

  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (request === "server-only") return require.resolve("next/dist/compiled/server-only/empty.js");
    if (request.startsWith("@/")) request = path.resolve("src", request.slice(2));
    return originalResolve.call(this, request, parent, ...rest);
  };
  require.extensions[".ts"] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    module._compile(outputText, filename);
  };

  const realFetch = global.fetch;
  let scenario = "outage";
  let intercepted = 0;
  global.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.geoapify.com") {
      intercepted++;
      if (scenario === "outage") return Response.json({}, { status: 503 });
      return Response.json({ results: [{ result_type: "city", city: "Nova Odessa" }] });
    }
    assert.equal(url.origin, "http://127.0.0.1:54321", "Unexpected outbound request blocked");
    return realFetch(input, init);
  };

  // A unique fake key prevents a real cached quote from hiding the simulated failure.
  process.env.GEOAPIFY_API_KEY = "sandbox-fallback-simulation-" + Date.now();
  const { DeliveryQuoteService } = require("../src/server/delivery/delivery-quote-service.ts");
  const { createAdminClient } = require("../src/lib/supabase/admin.ts");
  const admin = createAdminClient();
  const storeId = process.env.GEOAPIFY_PILOT_STORE_ID;
  const { data: store, error } = await admin.from("stores")
    .select("organization_id").eq("id", storeId).eq("slug", "quality-menu").single();
  if (error) throw error;
  const input = {
    admin, organizationId: store.organization_id, storeId, subtotalCents: 2500, useRoadDistance: true,
    address: { street: "Avenida João Pessoa", number: "777", district: "Centro", city: "Nova Odessa", state: "SP" },
  };

  process.env.GEOAPIFY_PILOT_NEIGHBORHOOD_FALLBACK = "true";
  assert.deepEqual(await DeliveryQuoteService.quote(input), {
    serviceable: true, feeCents: 500, estimatedMinMinutes: 30, estimatedMaxMinutes: 60,
  });
  console.log("OK | Geoapify 503 com reserva habilitada: frete R$ 5,00");

  process.env.GEOAPIFY_PILOT_NEIGHBORHOOD_FALLBACK = "false";
  assert.deepEqual(await DeliveryQuoteService.quote(input), { serviceable: false, reason: "route_unavailable" });
  console.log("OK | Geoapify 503 com reserva desligada: entrega bloqueada");

  scenario = "unverified";
  process.env.GEOAPIFY_PILOT_NEIGHBORHOOD_FALLBACK = "true";
  assert.deepEqual(await DeliveryQuoteService.quote(input), {
    serviceable: true, feeCents: 500, estimatedMinMinutes: 30, estimatedMaxMinutes: 60,
  });
  assert.equal(intercepted, 3, "All three provider calls must be simulated");
  console.log("OK | endereço sem confirmação: frete cadastrado R$ 5,00");
  console.log("Homologação da reserva concluída | 3 cenários aprovados");
}

main().catch(() => {
  console.error("Falha na homologação da reserva. Confira migração, configuração e cota do sandbox.");
  process.exitCode = 1;
});
