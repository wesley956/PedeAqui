import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { MoreToolsClient, type MoreToolItem } from "./more-tools-client";

export default async function MoreToolsPage() {
  const access = await NavigationAccessService.load();
  const items: MoreToolItem[] = access.items
    .filter((item) => item.priority !== "hidden" && !item.easyPrimary)
    .map((item) => ({ key: item.key, label: item.label, href: item.href, group: item.group }));

  return <MoreToolsClient items={items} />;
}
