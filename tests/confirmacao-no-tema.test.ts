import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("ações de excluir", () => {
  it("confirmam num diálogo do tema, com o vermelho só no botão de confirmação", () => {
    const button = read("src/components/ui/confirm-submit-button.tsx");
    expect(button).not.toContain("window.confirm");
    expect(button).toContain('tone = "secondary"');
    expect(button).toContain('<Button type="button" tone="danger" onClick={confirm}>');
    expect(button).toContain("button?.form?.requestSubmit(button);");
  });

  it("não deixam botões vermelhos soltos na linha", () => {
    expect(read("src/app/(app)/clientes/[id]/page.tsx")).not.toContain('<Button tone="danger" type="submit">Remover</Button>');
    expect(read("src/app/(app)/equipe/page.tsx")).not.toContain('<ConfirmTeamActionButton tone="danger"');
    expect(read("src/app/(app)/conversas/page.tsx")).not.toContain('<Button tone="danger" type="submit">Encerrar</Button>');
  });
});
