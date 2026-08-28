import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const toneSource = readFileSync(join(root, "src/features/orders/order-alert-tone.ts"), "utf8");
const alertSource = readFileSync(join(root, "src/features/orders/use-order-alert.ts"), "utf8");
const boardSource = readFileSync(join(root, "src/features/orders/order-manager-board.tsx"), "utf8");
const customBoardSource = readFileSync(join(root, "src/features/orders/custom-order-workflow-board.tsx"), "utf8");

describe("order alert sound", () => {
  it("uses the normalized voice asset at full element volume", () => {
    expect(existsSync(join(root, "public/audio/pedeaqui-pedido.mp3"))).toBe(true);
    expect(toneSource).toContain('/audio/pedeaqui-pedido.mp3');
    expect(toneSource).toContain("audio.volume = 1");
  });

  it("persists the preference without falsely claiming blocked playback is active", () => {
    expect(toneSource).toContain("pedeaqui:orders:sound-enabled");
    expect(alertSource).toContain("readOrderAlertPreference()");
    expect(alertSource).toContain("writeOrderAlertPreference(true)");
    expect(alertSource).toContain('"needs_activation"');
    expect(alertSource).toContain('"Liberar som"');
    expect(alertSource).toContain("navegador bloqueou o áudio");
    expect(boardSource).not.toContain("o som continua ativado");
  });

  it("offers a real sound test in standard, simplified and custom order boards", () => {
    expect(boardSource).toContain("useOrderAlert(setNotice)");
    expect(boardSource).toContain("Testar som");
    expect(customBoardSource).toContain("useOrderAlert(setNotice)");
    expect(customBoardSource).toContain("Testar som");
    expect(customBoardSource).toContain('event: "INSERT"');
    expect(customBoardSource).toContain("notifyNewOrder()");
  });
});
