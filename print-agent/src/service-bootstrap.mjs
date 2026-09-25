import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSingleInstance, markCurrentReleaseHealthy } from "./service-state.mjs";

const releaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(releaseRoot, "package.json"), "utf8").replace(/^\uFEFF/, ""));
const version = String(packageJson?.version || "").trim();

let instance;
try {
  instance = acquireSingleInstance();
} catch (error) {
  if (error?.code === "PEDEAQUI_INSTANCE_RUNNING") {
    console.error("PedeAqui Print Agent single-instance guard blocked a second runtime.");
    process.exit(73);
  }
  throw error;
}

let healthyRecorded = false;
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  if (!healthyRecorded && response.ok) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (String(url || "").includes("/api/print-agent/heartbeat")) {
      try {
        healthyRecorded = markCurrentReleaseHealthy(version);
        if (healthyRecorded) console.log(`Print Agent release ${version} marked healthy after heartbeat.`);
      } catch (error) {
        console.error("release health marker failed", error);
      }
    }
  }
  return response;
};

process.once("SIGTERM", () => {
  instance?.release();
  process.exit(0);
});
process.once("SIGINT", () => {
  instance?.release();
  process.exit(0);
});

await import("./index.mjs");
