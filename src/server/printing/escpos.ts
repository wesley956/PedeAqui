const ESC = 0x1b;
const GS = 0x1d;

const cp850: Record<string, number> = {
  "á": 160, "í": 161, "ó": 162, "ú": 163, "Á": 181, "Í": 214, "Ó": 224, "Ú": 233,
  "é": 130, "É": 144, "â": 131, "Â": 182, "ã": 198, "Ã": 199, "õ": 228, "Õ": 229,
  "ê": 136, "Ê": 210, "ô": 147, "Ô": 226, "ç": 135, "Ç": 128, "à": 133, "À": 183,
};

export function encodeCp850(text: string) {
  const bytes: number[] = [];
  for (const char of text) {
    if (char === "\u00a0" || char === "\u202f") { bytes.push(32); continue; }
    const mapped = cp850[char];
    if (mapped !== undefined) { bytes.push(mapped); continue; }
    const code = char.charCodeAt(0);
    bytes.push(code >= 32 && code <= 126 || code === 10 || code === 13 ? code : 63);
  }
  return Buffer.from(bytes);
}

export function encodeEscPos(text: string) {
  return Buffer.concat([
    Buffer.from([ESC, 0x40]), // initialize
    Buffer.from([ESC, 0x74, 0x02]), // CP850 on common ESC/POS implementations
    Buffer.from([ESC, 0x61, 0x00]), // left align
    encodeCp850(text),
    Buffer.from([0x0a, 0x0a]),
    Buffer.from([GS, 0x56, 0x00]), // full cut
  ]);
}

export function expectedCharactersPerLine(paperWidthMm: number) {
  return paperWidthMm === 58 ? 32 : 48;
}
