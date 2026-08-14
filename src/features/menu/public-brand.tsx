import type { CSSProperties, ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import styles from "./public-brand.module.css";

function contrastText(hex: string) {
  const value = hex.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#171717" : "#FFFFFF";
}

export function restaurantBrandVars(primaryColor: string) {
  return { "--restaurant-primary": primaryColor, "--restaurant-on-primary": contrastText(primaryColor) } as CSSProperties;
}

export function RestaurantBrand({ name, logoUrl, primaryColor, children }: { name: string; logoUrl: string | null; primaryColor: string; children?: ReactNode }) {
  const initial = name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "R";
  return <div className={styles.restaurantBrand} style={restaurantBrandVars(primaryColor)}>
    {logoUrl ? <img src={logoUrl} alt={`Logo ${name}`} className={styles.logo} width={74} height={74} /> : <div className={styles.fallback} aria-label={`Identidade ${name}`}>{initial}</div>}
    <div className={styles.copy}><h1 className={styles.name}>{name}</h1>{children}</div>
  </div>;
}

export function PedeAquiSignature() {
  return <footer className={styles.platformSignature} aria-label="PedeAqui — Seu pedido começa aqui"><PedeAquiLogo size="xs" decorative /><span>Seu pedido começa aqui.</span></footer>;
}
