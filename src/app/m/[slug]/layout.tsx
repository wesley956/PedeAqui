import { PublicThemeCycleButton } from "@/features/theme/public-theme-cycle-button";

export default function PublicStoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <PublicThemeCycleButton />
    </>
  );
}
