import Link from "next/link";
import { isModuleKey, moduleLabel } from "@/modules/module-catalog";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";

const reasonText: Record<string, string> = {
  disabled_by_store: "Esta ferramenta está desativada para a unidade atual.",
  not_supported_by_profile: "Esta ferramenta não faz parte do perfil deste negócio.",
  missing_dependency: "Esta ferramenta depende de outro recurso que precisa ser ativado primeiro.",
  not_in_plan: "Esta ferramenta não está disponível no plano atual.",
  temporarily_unavailable: "Esta ferramenta está temporariamente indisponível.",
};

export default async function ModuleUnavailablePage({ searchParams }: { searchParams: Promise<{ module?: string; reason?: string }> }) {
  const params = await searchParams;
  const access = await NavigationAccessService.load();
  const moduleKey = params.module && isModuleKey(params.module) ? params.module : null;
  const label = moduleKey ? moduleLabel(moduleKey, access.businessType) : "Este recurso";
  const canManageModules = access.permissionKeys.includes(PERMISSIONS.STORES_MANAGE);

  return (
    <section style={{ minHeight: "55vh", display: "grid", placeItems: "center", padding: 20 }}>
      <article className="card" style={{ width: "min(100%, 620px)", padding: 24, display: "grid", gap: 14 }}>
        <div><p className="muted" style={{ margin: 0 }}>RECURSO INDISPONÍVEL</p><h1 style={{ marginBottom: 8 }}>{label}</h1>
          <p className="muted" style={{ margin: 0 }}>{reasonText[params.reason ?? ""] ?? "Esta ferramenta não está disponível para a unidade atual."}</p>
        </div>
        <p style={{ margin: 0 }}>Nenhum histórico foi apagado. Se o recurso for habilitado novamente, os dados continuam disponíveis conforme suas permissões.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/dashboard">Voltar ao painel</Link>
          {canManageModules ? <Link href="/configuracoes/modulos">Configurar módulos</Link> : null}
        </div>
      </article>
    </section>
  );
}
