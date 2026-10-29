import path from "node:path";
import { fileURLToPath } from "node:url";
import { updateAgent } from "./updater-core.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  await updateAgent({ rootDir });
} catch {
  console.error("Print Agent automatic update could not complete; recovery will be retried on the next startup.");
}
