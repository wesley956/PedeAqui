import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["ci-shots/**/*.test.tsx"], css: { include: [/.+/], modules: { classNameStrategy: "non-scoped" } } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "server-only": path.resolve(__dirname, "../node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
});
