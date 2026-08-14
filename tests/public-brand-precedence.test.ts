import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const brand = readFileSync("src/features/menu/public-brand.tsx", "utf8");
const page = readFileSync("src/app/m/[slug]/page.tsx", "utf8");
describe("public brand precedence", () => {
  it("uses restaurant identity as the public menu protagonist", () => { expect(page).toContain("RestaurantBrand"); expect(page).toContain("menu.settings.logo_url"); expect(page).toContain("menu.settings.primary_color"); });
  it("uses the restaurant initial instead of impersonating PedeAqui when no logo exists", () => { expect(brand).toContain("name.trim().charAt(0)"); expect(brand).not.toContain('|| "P"'); });
  it("keeps PedeAqui as a canonical platform signature", () => { expect(brand).toContain("PedeAquiLogo"); expect(page).toContain("PedeAquiSignature"); });
  it("derives readable foreground from the validated restaurant color", () => { expect(brand).toContain("contrastText"); expect(brand).toContain("--restaurant-on-primary"); });
});
