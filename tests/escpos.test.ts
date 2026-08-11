import { describe, expect, it } from "vitest";
import { encodeCp850, encodeEscPos, expectedCharactersPerLine } from "@/server/printing/escpos";

describe("ESC/POS encoder", () => {
  it("encodes common pt-BR characters using CP850", () => {
    expect([...encodeCp850("çáé")]).toEqual([135, 160, 130]);
  });

  it("wraps content with initialization/codepage/cut commands", () => {
    const bytes = encodeEscPos("PEDIDO #42\n");
    expect([...bytes.subarray(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
    expect([...bytes.subarray(-3)]).toEqual([0x1d, 0x56, 0x00]);
  });

  it("uses practical character widths for 58 and 80 mm", () => {
    expect(expectedCharactersPerLine(58)).toBe(32);
    expect(expectedCharactersPerLine(80)).toBe(48);
  });
});
