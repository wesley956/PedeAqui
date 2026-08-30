"use client";

export function PrintContractButton({ label = "Imprimir / salvar PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()}>{label}</button>;
}
