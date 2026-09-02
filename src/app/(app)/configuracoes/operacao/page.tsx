import Link from "next/link";
import { GuidedSetupForm } from "@/features/operations/guided-setup-form";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { OperationalSettingsService } from "@/server/stores/operational-settings-service";
import styles from "./operacao-config.module.css";

export default async function OperationalSetupPage() {
  const [access, current] = await Promise.all([NavigationAccessService.load(), OperationalSettingsService.loadCurrent()]);
  const deliveryAvailable = access.moduleAvailability.deliveries.available;
  const canManage = access.permissionKeys.includes(PERMISSIONS.STORES_MANAGE);
  return <section className={styles.page}>
    <header><p className={styles.eyebrow}>CONFIGURAÇÃO GUIADA</p><h1>Como seu restaurante trabalha?</h1><p>Responda pensando no horário de maior movimento. Você verá o impacto antes de salvar.</p></header>
    <GuidedSetupForm settings={current.settings} deliveryAvailable={deliveryAvailable} canManage={canManage} />
    <section className={styles.related}><h2>Complete quando fizer sentido</h2><p>Estas configurações continuam independentes e respeitam seus módulos.</p><div>
      <Link href="/configuracoes/pagamentos"><strong>Pagamentos</strong><span>Escolha formas e confirmação.</span></Link>
      <Link href="/configuracoes/impressoes"><strong>Impressão</strong><span>Conexão, fila e contingência.</span></Link>
      {access.moduleAvailability.cash.available ? <Link href="/configuracoes/caixa"><strong>Caixa</strong><span>Pontos e fechamento.</span></Link> : null}
      <Link href="/equipe"><strong>Equipe e acessos</strong><span>Defina quem pode fazer cada ação.</span></Link>
    </div></section>
  </section>;
}
