import Image from "next/image";

export type PedeAquiBrandSize = "xs" | "sm" | "md" | "lg";
export type PedeAquiLogoSurface = "light" | "dark";

type BrandAccessibilityProps = {
  /** Use only when nearby text already names the brand. */
  decorative?: boolean;
  /** Optional accessible name override for non-decorative usage. */
  alt?: string;
};

type SharedBrandProps = BrandAccessibilityProps & {
  size?: PedeAquiBrandSize;
  className?: string;
  priority?: boolean;
};

type PedeAquiLogoProps = SharedBrandProps & {
  /** Selects the canonical wordmark contrast for the surface behind it. */
  surface?: PedeAquiLogoSurface;
};

const LOGO_DIMENSIONS: Record<PedeAquiBrandSize, { width: number; height: number }> = {
  xs: { width: 70, height: 24 },
  sm: { width: 93, height: 32 },
  md: { width: 116, height: 40 },
  lg: { width: 163, height: 56 },
};

const SYMBOL_DIMENSIONS: Record<PedeAquiBrandSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
};

function accessibleAlt(decorative: boolean, alt: string | undefined, fallback: string) {
  return decorative ? "" : (alt ?? fallback);
}

export function PedeAquiLogo({
  size = "md",
  surface = "light",
  decorative = false,
  alt,
  className,
  priority = false,
}: PedeAquiLogoProps) {
  const dimensions = LOGO_DIMENSIONS[size];
  const src = surface === "dark" ? "/brand/pedeaqui-logo-on-dark.svg" : "/brand/pedeaqui-logo.svg";

  return (
    <Image
      data-brand="pedeaqui-logo"
      src={src}
      alt={accessibleAlt(decorative, alt, "PedeAqui")}
      aria-hidden={decorative || undefined}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}

export function PedeAquiSymbol({
  size = "md",
  decorative = false,
  alt,
  className,
  priority = false,
}: SharedBrandProps) {
  const dimension = SYMBOL_DIMENSIONS[size];

  return (
    <Image
      data-brand="pedeaqui-symbol"
      src="/brand/pedeaqui-symbol.svg"
      alt={accessibleAlt(decorative, alt, "Símbolo PedeAqui")}
      aria-hidden={decorative || undefined}
      width={dimension}
      height={dimension}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
