export const PEDEAQUI_LEGAL = {
  brand: "PedeAqui",
  legalName: "Andre Robson Aparecido Vera Cruz",
  cnpj: "25.240.363/0001-25",
  address: "Rua Aparecida Tognetta Bassette, 1208",
  city: "Americana",
  state: "SP",
  postalCode: "13470-755",
  country: "Brasil",
  phoneDisplay: "+55 19 98144-7794",
  phoneHref: "tel:+5519981447794",
} as const;

export const PEDEAQUI_LEGAL_ADDRESS = `${PEDEAQUI_LEGAL.address} · ${PEDEAQUI_LEGAL.city}/${PEDEAQUI_LEGAL.state} · CEP ${PEDEAQUI_LEGAL.postalCode} · ${PEDEAQUI_LEGAL.country}`;
