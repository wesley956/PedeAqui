import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("platform unit support form parameters", () => {
  it("renders support forms from the page that resolved both route identifiers", () => {
    const page = read("src/app/platform/empresas/[organizationId]/unidades/[storeId]/page.tsx");
    const layout = read("src/app/platform/empresas/[organizationId]/unidades/[storeId]/layout.tsx");

    expect(page).toContain("const { organizationId, storeId } = await params");
    expect(page).toContain("<ModuleSupportPanel organizationId={organizationId} storeId={storeId} />");
    expect(page).toContain("<SupportActionsPanel organizationId={organizationId} storeId={storeId} />");
    expect(layout).not.toContain("ModuleSupportPanel");
    expect(layout).not.toContain("SupportActionsPanel");
  });
});
