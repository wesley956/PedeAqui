import { PosShell } from "@/features/pdv/pos-shell";
import { PdvService } from "@/server/pdv/pdv-service";

export default async function PdvPage() {
  const data = await PdvService.load();
  return <PosShell {...data} />;
}
