#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function sanitizeIfoodSandboxOrder(input) {
  const source = structuredClone(object(input));
  if (!source.id || !source.merchant || !Array.isArray(source.items)) {
    throw new Error("Expected a real iFood order details JSON with id, merchant and items");
  }

  source.id = "sandbox-order-001";
  if ("displayId" in source) source.displayId = "SBX001";
  source.merchant = { ...object(source.merchant), id: "sandbox-merchant-001", name: "SANITIZED TEST MERCHANT" };
  source.customer = {
    ...object(source.customer),
    name: "SANITIZED CUSTOMER",
    phone: source.customer?.phone
      ? { ...object(source.customer.phone), number: "00000000000", localizer: "000000" }
      : undefined,
  };

  source.items = source.items.map((rawItem, itemIndex) => {
    const item = { ...object(rawItem) };
    if ("id" in item) item.id = `sandbox-item-${itemIndex + 1}`;
    if ("uniqueId" in item) item.uniqueId = `sandbox-item-unique-${itemIndex + 1}`;
    if (typeof item.observations === "string" && item.observations.trim()) item.observations = "[SANITIZED OBSERVATION]";
    if (Array.isArray(item.options)) {
      item.options = item.options.map((rawOption, optionIndex) => {
        const option = { ...object(rawOption) };
        if ("id" in option) option.id = `sandbox-option-${itemIndex + 1}-${optionIndex + 1}`;
        return option;
      });
    }
    return item;
  });

  if (source.delivery && typeof source.delivery === "object") {
    const delivery = { ...object(source.delivery) };
    if ("pickupCode" in delivery && delivery.pickupCode) delivery.pickupCode = "0000";
    if (delivery.deliveryAddress && typeof delivery.deliveryAddress === "object") {
      const address = { ...object(delivery.deliveryAddress) };
      address.streetName = "SANITIZED STREET";
      address.streetNumber = "000";
      if ("neighborhood" in address) address.neighborhood = "SANITIZED NEIGHBORHOOD";
      if ("district" in address) address.district = "SANITIZED DISTRICT";
      address.city = "SANITIZED CITY";
      address.state = "SP";
      if ("postalCode" in address) address.postalCode = "00000000";
      if ("zipCode" in address) address.zipCode = "00000000";
      if ("complement" in address && address.complement) address.complement = "[SANITIZED]";
      if ("reference" in address && address.reference) address.reference = "[SANITIZED]";
      if (address.coordinates && typeof address.coordinates === "object") {
        address.coordinates = { ...object(address.coordinates), latitude: 0, longitude: 0 };
      }
      if ("latitude" in address) address.latitude = 0;
      if ("longitude" in address) address.longitude = 0;
      delivery.deliveryAddress = address;
    }
    source.delivery = delivery;
  }

  if (typeof source.extraInfo === "string" && source.extraInfo.trim()) source.extraInfo = "[SANITIZED EXTRA INFO]";
  return source;
}

export function assertFixtureHasNoObviousPii(input) {
  const text = JSON.stringify(input);
  const forbidden = [
    /\+?55\s?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/,
    /\b\d{5}-?\d{3}\b/,
    /@(?=[a-z0-9.-]+\.[a-z]{2,})/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`Sanitized fixture still matches PII pattern ${pattern}`);
  }
  if (input.customer?.name !== "SANITIZED CUSTOMER") throw new Error("Customer name was not sanitized");
  if (input.merchant?.id !== "sandbox-merchant-001") throw new Error("Merchant identity was not sanitized");
  return true;
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error("Usage: node scripts/sanitize-ifood-sandbox-fixture.mjs <raw-order.json> <sanitized-fixture.json>");
    process.exitCode = 2;
    return;
  }
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const sanitized = sanitizeIfoodSandboxOrder(raw);
  assertFixtureHasNoObviousPii(sanitized);
  await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, { flag: "wx" });
  console.log(`Sanitized iFood sandbox fixture written to ${outputPath}`);
}

if (process.argv[1]?.endsWith("sanitize-ifood-sandbox-fixture.mjs")) {
  await main();
}
