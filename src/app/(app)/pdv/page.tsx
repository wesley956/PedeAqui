import { PdvWorkspace } from "@/features/pdv/events/pdv-workspace";
import { PdvService } from "@/server/pdv/pdv-service";

export default async function PdvPage() {
  const data = await PdvService.load();
  return <PdvWorkspace {...data} />;
}
