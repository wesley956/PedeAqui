/** Conservative escalation: never create a second order or promise a schedule. */
export function needsWhatsAppServiceRecovery(normalized: string): boolean {
  return /\b(?:reclamacao|reclamar|estragado|estragada|azedo|azeda|queimado|queimada|veio errado|veio errada|faltou item|pedido incompleto|pedido atrasado|pedido esta atrasado|nao chegou meu pedido|meu pedido nao chegou|pedido nao chegou)\b/.test(normalized)
    || /\b(?:site|cardapio|aplicativo|app|link)\b.*\b(?:nao abre|nao carrega|nao funciona|travou|travando|deu erro|com erro)\b/.test(normalized)
    || /\b(?:nao sei|nao tenho certeza|como saber)\b.*\b(?:pedido|compra)\b.*\b(?:finaliz|conclu|confirm)/.test(normalized)
    || /\b(?:agendar|encomenda|encomendar)\b/.test(normalized)
    || /\b(?:pedido|entrega)\b.*\b(?:demorando|atrasou|atrasado|atrasada|nao chegou)\b/.test(normalized);
}

export function catalogAvailabilityQuery(normalized: string): string | null {
  const match = normalized.match(/^(?:(?:oi|ola)\s+)?(?:voces tem|voces vendem|tem|vende|vendem|teria)\s+(.+)$/);
  if (!match?.[1]) return null;
  const query = match[1].replace(/\s+(?:hoje|agora|por favor)$/, "").trim();
  if (/\b(?:entrega|delivery|taxa|frete|pix|cartao|cupom|cashback|promocao|desconto|horario|vaga)\b/.test(query)) return null;
  return query.length >= 3 && query.length <= 120 ? query : null;
}

export function asksStoreLocation(normalized: string): boolean {
  return /\b(?:onde voces ficam|onde fica a loja|onde fica o restaurante|qual o endereco|qual endereco|qual a localizacao|qual cidade|em que cidade|em qual cidade|manda a localizacao|localizacao da loja)\b/.test(normalized)
    || /^(?:endereco|localizacao)$/.test(normalized);
}
