import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/entregador/page.tsx", "utf8");
const tracker = readFileSync("src/features/delivery/driver-location-tracker.tsx", "utf8");
const css = readFileSync("src/features/delivery/courier.module.css", "utf8").replace(/\s+/g, "");

describe("courier route residual UX #843", () => {
  it("shows the next action before secondary destination and contact controls", () => {
    const payment = page.indexOf('className={`${styles.payment}');
    const next = page.indexOf("Próxima ação", payment);
    const destination = page.indexOf("className={styles.destination}", payment);
    expect(payment).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(payment);
    expect(next).toBeLessThan(destination);
    expect(css).toContain(".next{min-width:0;display:grid");
  });

  it("explains capacity with text instead of only a fraction", () => {
    expect(page).toContain("{data.activeDeliveryCount}/{data.driver.max_active_deliveries} em uso");
  });

  it("allows recovery from denied, offline and failed location sharing", () => {
    expect(tracker).toContain('state === "denied" || state === "offline" || state === "error"');
    expect(tracker).toContain("Tentar compartilhar novamente");
    expect(tracker).toContain("Você ainda pode concluir a entrega sem rastreamento");
    expect(tracker).toContain("navigator.geolocation.clearWatch(watchId.current)");
  });
});
