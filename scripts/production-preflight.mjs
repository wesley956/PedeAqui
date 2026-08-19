import { readFile } from "node:fs/promises";
import process from "node:process";

const EXPECTED_BUCKET = {
  id: "catalog-media",
  public: true,
  fileSizeLimit: 5 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
};
const MIN_SERVER_ACTION_LIMIT_MB = 12;

function fail(message) {
  throw new Error(`PREFLIGHT: ${message}`);
}

function ok(message) {
  console.log(`PREFLIGHT: ${message}`);
}

async function checkStaticContracts() {
  const [nextConfig, storageContract, imageService] = await Promise.all([
    readFile("next.config.ts", "utf8"),
    readFile("supabase/sql/09_catalog_storage.sql", "utf8"),
    readFile("src/server/catalog/catalog-image-service.ts", "utf8"),
  ]);

  const bodyLimitMatch = nextConfig.match(/bodySizeLimit:\s*["'](\d+)mb["']/i);
  if (!bodyLimitMatch) fail("serverActions.bodySizeLimit não foi encontrado em next.config.ts.");
  const bodyLimitMb = Number(bodyLimitMatch[1]);
  if (!Number.isFinite(bodyLimitMb) || bodyLimitMb < MIN_SERVER_ACTION_LIMIT_MB) {
    fail(`serverActions.bodySizeLimit precisa ser >= ${MIN_SERVER_ACTION_LIMIT_MB} MB; encontrado ${bodyLimitMb || "inválido"}.`);
  }

  for (const requiredText of [
    "catalog-media",
    "5242880",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]) {
    if (!storageContract.includes(requiredText)) {
      fail(`contrato de Storage não declara ${requiredText}.`);
    }
  }

  if (!imageService.includes('CATALOG_MEDIA_BUCKET = "catalog-media"')) {
    fail("CatalogImageService não aponta para o bucket catalog-media.");
  }
  if (!imageService.includes("5 * 1024 * 1024")) {
    fail("CatalogImageService não mantém o limite individual de 5 MiB.");
  }

  ok(`contratos estáticos válidos (Server Actions ${bodyLimitMb} MB; imagem individual 5 MiB).`);
}

function hasLiveCredentials() {
  return Boolean(
    process.env.PREFLIGHT_SUPABASE_URL?.trim()
    && process.env.PREFLIGHT_SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

async function checkLiveStorageContract() {
  const requireLive = process.env.PREFLIGHT_REQUIRE_LIVE === "true";
  if (!hasLiveCredentials()) {
    if (requireLive) fail("checagem live exigida, mas PREFLIGHT_SUPABASE_URL/SERVICE_ROLE_KEY não foram configurados.");
    ok("checagem live ignorada; credenciais de preflight não configuradas.");
    return;
  }

  const baseUrl = process.env.PREFLIGHT_SUPABASE_URL.trim().replace(/\/+$/, "");
  const serviceRoleKey = process.env.PREFLIGHT_SUPABASE_SERVICE_ROLE_KEY.trim();
  const response = await fetch(`${baseUrl}/storage/v1/bucket/${EXPECTED_BUCKET.id}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    fail(`bucket ${EXPECTED_BUCKET.id} indisponível no ambiente live (HTTP ${response.status}).`);
  }

  const bucket = await response.json();
  if (bucket.id !== EXPECTED_BUCKET.id || bucket.name !== EXPECTED_BUCKET.id) {
    fail(`bucket live inesperado: ${String(bucket.id ?? bucket.name ?? "sem id")}.`);
  }
  if (bucket.public !== EXPECTED_BUCKET.public) {
    fail(`bucket ${EXPECTED_BUCKET.id} precisa ser público.`);
  }
  if (Number(bucket.file_size_limit) !== EXPECTED_BUCKET.fileSizeLimit) {
    fail(`bucket ${EXPECTED_BUCKET.id} precisa limitar arquivos a ${EXPECTED_BUCKET.fileSizeLimit} bytes.`);
  }

  const actualMimeTypes = new Set(Array.isArray(bucket.allowed_mime_types) ? bucket.allowed_mime_types : []);
  for (const mimeType of EXPECTED_BUCKET.allowedMimeTypes) {
    if (!actualMimeTypes.has(mimeType)) {
      fail(`bucket ${EXPECTED_BUCKET.id} não permite ${mimeType}.`);
    }
  }

  ok(`bucket live ${EXPECTED_BUCKET.id} atende ao contrato.`);
}

await checkStaticContracts();
await checkLiveStorageContract();
