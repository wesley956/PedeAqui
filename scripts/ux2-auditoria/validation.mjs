export function auditFailures(results) {
  if (!results.length) return [{ label: "auditoria", reasons: ["nenhuma evidência coletada"] }];
  return results.flatMap((entry) => {
    const reasons = [];
    if (entry.error) reasons.push(entry.error);
    if (entry.ok === false) reasons.push("fluxo não confirmado");
    if (entry.status !== undefined && (entry.status < 200 || entry.status >= 400)) reasons.push(`HTTP ${entry.status}`);
    if (entry.consoleErrors?.length) reasons.push("erro no navegador");
    if (entry.scriptPlacementWarning) reasons.push("script em posição inválida");
    if (entry.docWidth > entry.vw + 1) reasons.push("página excede a largura da tela");
    if (entry.clipped?.length) reasons.push("campos ou ações cortados");
    if (entry.axe === null) reasons.push("análise de acessibilidade não executada");
    if (entry.axe?.some((issue) => ["serious", "critical"].includes(issue.impact))) reasons.push("acessibilidade grave");
    return reasons.length ? [{ device: entry.device, label: entry.label, reasons }] : [];
  });
}

export function requireLocalTarget(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("A auditoria que altera dados exige um endereço HTTP local.");
  }
}
