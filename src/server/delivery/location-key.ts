export function normalizeLocationPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function neighborhoodKey(neighborhood: string, city: string, state: string) {
  return [neighborhood, city, state].map(normalizeLocationPart).join("|");
}
