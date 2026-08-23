import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { OperationalSettingsForm } from "@/features/platform/operational-settings-form";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import { PlatformRestaurant360Service } from "@/server/platform/platform-restaurant-360-service";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";
import styles from "@/app/platform/platform.module.css";

export default async function OperationalConfigurationPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  await PlatformAdminService.access();

  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from("stores")
    .select("id,organization_id,name")
    .eq("id", storeId)
    .maybeSingle();

  if (error) throw error;
  if (!store) notFound();

  const [details, settings] = await Promise.all([
    PlatformRestaurant360Service.load(store.organization_id, store.id),
    OperationalSettingsService.loadPlatform(store.organization_id, store.id),
  ]);

  if (!details) notFound();
  const activeModules = new Set(details.modules.active.map((module) => module.key));

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Link href="/platform#empresas">← Empresas e unidades</Link>
        <span>/</span>
        <Link href={`/platform/unidades/${store.id}`}>Visão 360°</Link>
        <span>/</span>
        <strong>Configurar operação</strong>
      </div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CONFIGURAÇÃO OPERACIONAL</p>
          <h1>{store.name}</h1>
          <p>
            Ajuste como os módulos já habilitados nesta unidade se comportam. Esta tela não contrata nem ativa módulos novos.
          </p>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Como esta unidade deve operar</h2>
            <p>As opções abaixo são por loja, auditadas e reversíveis. Módulos desligados continuam bloqueando seus recursos.</p>
          </div>
        </div>

        <div className={styles.supportGrid}>
          <article className={styles.supportCard}>
            <strong>Pedidos</strong>
            <span>{settings.ordersAutoAccept ? "Autoaceite ligado" : "Aceite manual"}</span>
            <span>{settings.ordersWorkflowMode === "simplified" ? "Board simplificado em 3 etapas" : "Board completo"}</span>
          </article>
          <article className={styles.supportCard}>
            <strong>Entregas</strong>
            <span>{settings.deliveriesAutoCreateWhenReady ? "Pedido pronto vai automaticamente para Entregas" : "Envio para Entregas segue o fluxo padrão"}</span>
            <span>{activeModules.has("driver") ? "Módulo de entregador disponível" : "Módulo de entregador não habilitado"}</span>
          </article>
          <article className={styles.supportCard}>
            <strong>Marketing</strong>
            <span>{activeModules.has("growth") ? "Módulo Growth disponível" : "Módulo Growth não habilitado"}</span>
            <span>{settings.growthCampaignsEnabled ? "Campanhas operacionais ligadas" : "Campanhas operacionais desligadas"}</span>
          </article>
        </div>

        <OperationalSettingsForm
          organizationId={store.organization_id}
          storeId={store.id}
          settings={settings}
          modules={activeModules}
        />
      </section>
    </div>
  );
}
