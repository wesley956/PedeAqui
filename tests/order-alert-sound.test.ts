import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const toneSource = readFileSync(join(root, "src/features/orders/order-alert-tone.ts"), "utf8");
const boardSource = readFileSync(join(root, "src/features/orders/order-manager-board.tsx"), "utf8");

describe("order alert sound", () => {
  it("uses the normalized voice asset at full element volume", () => {
    expect(existsSync(join(root, "public/audio/pedeaqui-pedido.mp3"))).toBe(true);
    expect(toneSource).toContain('/audio/pedeaqui-pedido.mp3');
    expect(toneSource).toContain("audio.volume = 1");
  });

  it("persists the preference and does not turn it off after a blocked playback", () => {
    expect(toneSource).toContain("pedeaqui:orders:sound-enabled");
    expect(boardSource).toContain("readOrderAlertPreference");
    expect(boardSource).toContain("writeOrderAlertPreference(true)");
    expect(boardSource).toContain("o som continua ativado");
  });
});
