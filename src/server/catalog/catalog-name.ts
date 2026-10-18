/**
 * Normaliza nomes do catálogo para comparar "o mesmo sabor" entre grupos diferentes:
 * ignora acentos, caixa e espaços nas pontas ("Calabresa com Queijo" === "calabresa com queijo").
 */
export function normalizedCatalogName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR");
}
