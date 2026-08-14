import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/(app)/salao/[tableId]/page.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/dining/dining.module.css"), "utf8");

describe("table service flow", () => {
  it("presents the linear operational journey", () => {
    for (const text of ["Abrir atendimento", "Adicionar itens e enviar rodada", "Acompanhar rodadas", "Pedir conta", "Concluir e liberar mesa"]) expect(page).toContain(text);
  });

  it("preserves every pre-existing server action", () => {
    for (const action of ["openDiningTabAction", "setDiningTableStatusAction", "addDiningMemberAction", "allocateDiningItemAction", "payDiningTabAction", "rotateDiningQrAction", "setDiningTabStatusAction", "transferDiningTabAction"]) expect(page).toContain(action);
    expect(page).toContain("DiningRoundComposer");
  });

  it("keeps secondary operations available without competing with the next action", () => {
    expect(page).toContain("secondaryOps");
    expect(page).toContain("Pessoas e divisão da conta");
    expect(page).toContain("Mais ações da comanda");
    expect(page).toContain("Pedido por QR");
  });

  it("uses touch friendly controls and a responsive flow indicator", () => {
    expect(css).toContain(".flowSteps");
    expect(css).toContain(".secondaryOps>summary");
    expect(css).toContain("var(--control-height-lg)");
  });
});
