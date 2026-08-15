"use client";

import { useState } from "react";

export function PixCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <button type="button" onClick={copyCode}>
      {copied ? "Código copiado ✓" : "Copiar código Pix"}
    </button>
  );
}
