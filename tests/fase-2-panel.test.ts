import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNeighborhoodList } from "@/server/delivery/neighborhood-bulk";

const read = (path: string) => readFileSync(path, "utf8");

describe("bairros em lote", () => {
  it("reads one neighborhood per line with the fee at the end, in several common formats", () => {
    const { rows, errors } = parseNeighborhoodList("Centro; 5,00\nJardim América - 7\nVila Nova\t6,50\nSão Vito R$ 8,00\n\nParque 2 = 4.5");
    expect(errors).toEqual([]);
    expect(rows.map((row) => [row.name, row.feeCents])).toEqual([
      ["Centro", 500],
      ["Jardim América", 700],
      ["Vila Nova", 650],
      ["São Vito", 800],
      ["Parque 2", 450],
    ]);
  });

  it("reports the line number of lines it could not read and skips repeated neighborhoods", () => {
    const { rows, errors } = parseNeighborhoodList("Centro; 5\nSem taxa\ncentro; 6\nX; 3");
    expect(rows.map((row) => row.name)).toEqual(["Centro"]);
    expect(errors.map((error) => [error.line, error.reason])).toEqual([
      [2, "faltou a taxa no fim da linha"],
      [3, "bairro repetido na lista"],
      [4, "nome do bairro muito curto"],
    ]);
  });

  it("creates new neighborhoods and only updates fees of existing ones, never deleting", () => {
    const service = read("src/server/delivery/delivery-service.ts");
    const bulk = service.slice(service.indexOf("static async upsertNeighborhoodsBulk"), service.indexOf("static async updateNeighborhood("));
    expect(bulk).toContain("authorize(PERMISSIONS.DELIVERY_MANAGE)");
    expect(bulk).toContain('.eq("organization_id", context.organizationId).eq("store_id", storeId)');
    expect(bulk).not.toContain(".delete()");
  });
});

describe("disponibilidade agora", () => {
  it("is the catalog's first tab and the menu entry point", () => {
    expect(read("src/app/(app)/cardapio/catalog-navigation.tsx").indexOf("/cardapio/disponibilidade")).toBeLessThan(read("src/app/(app)/cardapio/catalog-navigation.tsx").indexOf("/cardapio/produtos"));
    expect(read("src/components/layout/navigation-model.ts")).toContain('href: "/cardapio/disponibilidade"');
    expect(read("src/components/layout/operation-topbar.tsx")).toContain('href="/cardapio/disponibilidade?buscar=1"');
  });

  it("groups flavors by name and pauses every copy, offering to mark blocked products as sold out", () => {
    const page = read("src/app/(app)/cardapio/disponibilidade/page.tsx");
    const actions = read("src/features/catalog/availability-actions.ts");
    const service = read("src/server/catalog/modifier-service.ts");
    expect(page).toContain("normalizedCatalogName(modifier.name)");
    expect(actions).toContain('"matching_name"');
    expect(actions).toContain("error instanceof ModifierPauseBlockedError");
    expect(service).toContain("markBlockedProductsSoldOut");
    expect(service).toContain('.eq("active", true).eq("availability", "available")');
  });
});

describe("horários em grade", () => {
  it("saves the whole week, inserting new periods before removing old ones", () => {
    const service = read("src/server/menu/store-menu-service.ts");
    const replace = service.slice(service.indexOf("static async replaceWeek"), service.indexOf("static async removeHour"));
    expect(replace).toContain("assertNoScheduleOverlap(periods)");
    expect(replace.indexOf(".insert(toInsert)")).toBeLessThan(replace.indexOf(".delete()"));
    expect(read("src/features/menu/actions.ts")).toContain("closesNextDay: closesAt < opensAt");
  });
});
