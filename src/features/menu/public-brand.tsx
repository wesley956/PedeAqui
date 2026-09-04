import type { CSSProperties, ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import styles from "./public-brand.module.css";

function channelToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded = normalized.length === 3 ? normalized.split("").map((value) => value + value).join("") : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return 0;
  const r = channelToLinear(Number.parseInt(expanded.slice(0, 2), 16));
  const g = channelToLinear(Number.parseInt(expanded.slice(2, 4), 16));
  const b = channelToLinear(Number.parseInt(expanded.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(first: number, second: number) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastText(hex: string) {
  const background = relativeLuminance(hex);
  const dark = "#171717";
  const white = "#FFFFFF";
  const darkContrast = contrastRatio(background, relativeLuminance(dark));
  const whiteContrast = contrastRatio(background, relativeLuminance(white));
  return darkContrast >= whiteContrast ? dark : white;
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
