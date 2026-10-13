import Link from "next/link";
import { IfoodConnectionCard } from "./ifood-connection-card";
import { IfoodIntegrationSettingsService } from "@/server/integrations/providers/ifood/ifood-integration-settings-service";
import styles from "./integracoes.module.css";
import { PageHeader } from "@/components/ui/page-header";

export default async function IntegrationsSettingsPage() {
  const snapshot = await IfoodIntegrationSettingsService.snapshot();

  return (
    <section className={styles.root}>
      <PageHeader title="Canais externos" description="Conecte canais de venda sem alterar automaticamente módulos, fluxo de pedidos ou quantidade de cards do painel." actions={<Link href="/configuracoes" className={styles.back}>← Configurações</Link>} />

      <aside className={styles.guardrail}>
        <strong>Integração não é módulo</strong>
        <span>Conectar o iFood apenas autentica e vincula a unidade. Pedidos, Cardápio e Entrega permanecem desligados até uma ativação explícita e separada.</span>
      </aside>

      {!snapshot.infrastructureReady ? (
        <div className={styles.pendingInfrastructure}>
          <strong>Estrutura omnichannel aguardando promoção</strong>
          <p>A conexão iFood ainda não está disponível neste ambiente. O funcionamento atual da loja permanece exatamente como está.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {snapshot.environments.map((environment) => (
            <IfoodConnectionCard key={environment.environment} environment={environment} />
          ))}
        </div>
      )}

      <section className={styles.help}>
        <h2>O que acontece ao conectar?</h2>
        <p>O PedeAqui valida a autorização oficial, identifica os estabelecimentos permitidos e cria o vínculo Merchant ↔ Unidade. Credenciais e tokens ficam somente no servidor.</p>
        <p>O quadro de pedidos, Entregas, Entregadores e demais módulos não são alterados por essa conexão.</p>
      </section>
    </section>
  );
}
