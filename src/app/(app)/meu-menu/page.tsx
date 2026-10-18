import { PageHeader } from "@/components/ui/page-header";
import { NAVIGATION_PIN_LIMIT, pinnedNavigationItems } from "@/components/layout/navigation-model";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { MenuCustomizer, type MenuCustomizerItem } from "./menu-customizer";

export default async function CustomizeMenuPage() {
  const access = await NavigationAccessService.load();
  const visible = access.items.filter((item) => item.priority !== "hidden");
  const items: MenuCustomizerItem[] = visible.map((item) => ({ key: item.key, label: item.key === "dashboard" ? "Início" : item.label }));

  // Sem personalização, o editor começa com o mesmo "Principal" que o menu mostra hoje.
  const pinned = pinnedNavigationItems(visible);
  const easy = visible.filter((item) => item.easyPrimary);
  const current = pinned.length > 0 ? pinned : easy.length > 0 ? easy : visible.filter((item) => item.priority === "primary").slice(0, 8);

  return (
    <section>
      <PageHeader
        title="Personalizar menu"
        description="Escolha o que fica no menu principal e arraste para mudar a ordem. O restante continua em Gestão e Conta e ajustes."
      />
      <MenuCustomizer
        items={items}
        initialPinned={current.map((item) => item.key)}
        customized={access.customNavigation}
        limit={NAVIGATION_PIN_LIMIT}
      />
    </section>
  );
}
