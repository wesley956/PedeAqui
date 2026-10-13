import { PublicThemeCycleButton } from "@/features/theme/public-theme-cycle-button";
import { publicStoreThemeVars } from "@/features/menu/public-brand";
import { getPublicStoreBrand } from "@/server/menu/public-store-brand-service";

export default async function PublicStoreLayout({ children, sheet, params }: Readonly<{ children: React.ReactNode; sheet: React.ReactNode; params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const brand = await getPublicStoreBrand(slug);
  return (
    <div style={{ display: "contents", ...(brand ? publicStoreThemeVars(brand.primaryColor) : {}) }} data-public-store-theme={brand ? "store" : "pedeaqui"}>
      {children}
      {sheet}
      <PublicThemeCycleButton />
    </div>
  );
}
