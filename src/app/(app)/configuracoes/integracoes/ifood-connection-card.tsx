"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bindIfoodMerchantAction,
  completeIfoodAuthorizationAction,
  disconnectIfoodAction,
  setIfoodCapabilityAction,
  startIfoodConnectionAction,
} from "@/features/integrations/ifood/actions";
import type { IfoodStartConnectionResult } from "@/server/integrations/providers/ifood/ifood-auth-model";
import type { IfoodCapabilityKey, IfoodSettingsEnvironmentSnapshot } from "@/server/integrations/providers/ifood/ifood-integration-settings-service";
import styles from "./integracoes.module.css";

type Props = {
  environment: IfoodSettingsEnvironmentSnapshot;
};

const statusLabel: Record<IfoodSettingsEnvironmentSnapshot["status"], string> = {
  connected: "Conectado",
  attention: "Atenção",
  action_required: "Ação necessária",
  unavailable: "Indisponível",
  disconnected: "Desconectado",
};

const environmentLabel = { sandbox: "Sandbox / testes", production: "Produção" } as const;
const capabilityLabel: Record<IfoodCapabilityKey, string> = {
  ifood_orders: "Pedidos",
  ifood_catalog: "Cardápio",
  ifood_shipping: "Entrega",
};

export function IfoodConnectionCard({ environment }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flow, setFlow] = useState<IfoodStartConnectionResult | null>(null);
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connected = environment.connectionState === "connected" && Boolean(environment.merchant);

  function begin() {
    setError(null);
    startTransition(async () => {
      const result = await startIfoodConnectionAction(environment.environment);
      if (!result.ok) return setError(result.error);
      if ("flow" in result) setFlow(result.flow);
      router.refresh();
    });
  }

  function completeAuthorization() {
    if (!flow || flow.kind !== "authorization_required") return;
    setError(null);
    startTransition(async () => {
      const result = await completeIfoodAuthorizationAction({
        integrationAccountId: flow.integrationAccountId,
        sessionId: flow.sessionId,
        state: flow.state,
        authorizationCode,
      });
      if (!result.ok) return setError(result.error);
      if ("flow" in result) {
        setFlow(result.flow);
        setAuthorizationCode("");
      }
      router.refresh();
    });
  }

  function bind(integrationAccountId: string, merchantId: string) {
    setError(null);
    startTransition(async () => {
      const result = await bindIfoodMerchantAction({ integrationAccountId, merchantId });
      if (!result.ok) return setError(result.error);
      setFlow(null);
      router.refresh();
    });
  }

  function disconnect() {
    if (!environment.accountId) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectIfoodAction(environment.accountId!);
      if (!result.ok) return setError(result.error);
      setFlow(null);
      router.refresh();
    });
  }

  function toggleCapability(capability: IfoodCapabilityKey, enabled: boolean) {
    if (!environment.merchant) return;
    setError(null);
    startTransition(async () => {
      const result = await setIfoodCapabilityAction({ merchantId: environment.merchant!.id, capability, enabled });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <article className={styles.card} data-connected={connected ? "true" : "false"}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.environment}>{environmentLabel[environment.environment]}</span>
          <h2>iFood</h2>
        </div>
        <span className={styles.status} data-state={environment.status}>{statusLabel[environment.status]}</span>
      </div>

      {environment.merchant ? (
        <div className={styles.merchant}>
          <strong>{environment.merchant.displayName ?? "Estabelecimento iFood"}</strong>
          <span>ID do estabelecimento: {environment.merchant.externalMerchantId}</span>
        </div>
      ) : (
        <p className={styles.muted}>Nenhum estabelecimento iFood está vinculado a esta unidade neste ambiente.</p>
      )}

      <div className={styles.capabilities} aria-label="Capacidades iFood">
        {(["ifood_orders", "ifood_catalog", "ifood_shipping"] as const).map((key) => {
          const enabled = environment.merchant?.capabilities[key] === true;
          const productionApproved = environment.environment !== "production" || environment.productionApprovals[key] === true;
          const catalogLocked = key === "ifood_catalog";
          const canEnable = connected && productionApproved && !catalogLocked;
          return (
            <span key={key} data-enabled={enabled ? "true" : "false"}>
              {capabilityLabel[key]} · {enabled ? "ativo" : "desligado"}
              {environment.merchant ? (
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pending || (!enabled && !canEnable)}
                  onClick={() => toggleCapability(key, !enabled)}
                  title={catalogLocked ? "O cardápio do PedeAqui permanece independente do iFood." : !productionApproved ? "Aguardando homologação/liberação controlada." : undefined}
                >
                  {enabled ? "Desligar" : catalogLocked ? "Independente" : !productionApproved ? "Aguardando liberação" : "Ativar"}
                </button>
              ) : null}
            </span>
          );
        })}
      </div>

      {environment.environment === "production" && environment.merchant ? (
        <p className={styles.meta}>Capabilities de produção só podem ser ativadas após homologação/rollout aprovado. Desligar continua disponível como rollback e preserva histórico.</p>
      ) : null}
      <p className={styles.meta}>Cardápio e preços do PedeAqui permanecem independentes do iFood.</p>

      {!environment.applicationConfigured ? (
        <p className={styles.notice}>Aplicativo iFood ainda não configurado para este ambiente. Nenhuma operação da loja é afetada.</p>
      ) : null}

      {environment.lastHealthAt ? <p className={styles.meta}>Último health check: {new Date(environment.lastHealthAt).toLocaleString("pt-BR")}</p> : null}
      {environment.lastHealthErrorCode ? <p className={styles.warning}>Health: {environment.lastHealthErrorCode}</p> : null}

      {flow?.kind === "authorization_required" ? (
        <section className={styles.flowBox} aria-label="Autorização iFood">
          <strong>Autorize o PedeAqui no Portal do Parceiro</strong>
          <p>Abra o link, autorize o aplicativo e copie o código de autorização exibido pelo iFood.</p>
          <div className={styles.userCode}><span>Código de ativação</span><strong>{flow.userCode}</strong></div>
          <a className={styles.linkButton} href={flow.verificationUrlComplete} target="_blank" rel="noreferrer">Abrir autorização do iFood ↗</a>
          <label>
            Código de autorização
            <input value={authorizationCode} onChange={(event) => setAuthorizationCode(event.target.value)} autoComplete="off" placeholder="Ex.: ABCD-EFGH" />
          </label>
          <button type="button" onClick={completeAuthorization} disabled={pending || !authorizationCode.trim()}>Continuar conexão</button>
        </section>
      ) : null}

      {flow?.kind === "merchant_selection" ? (
        <section className={styles.flowBox} aria-label="Selecionar estabelecimento iFood">
          <strong>Escolha o estabelecimento correto</strong>
          <p>O vínculo abaixo é autoritativo: o PedeAqui não escolhe loja por nome ou CNPJ aproximado.</p>
          <div className={styles.merchantList}>
            {flow.merchants.map((merchant) => (
              <button key={merchant.id} type="button" onClick={() => bind(flow.integrationAccountId, merchant.id)} disabled={pending}>
                <strong>{merchant.name}</strong><span>{merchant.id}</span>
              </button>
            ))}
            {flow.merchants.length === 0 ? <span className={styles.warning}>Nenhum estabelecimento foi autorizado para este token.</span> : null}
          </div>
        </section>
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.actions}>
        {connected ? (
          <button type="button" className={styles.secondary} onClick={disconnect} disabled={pending}>Desconectar</button>
        ) : (
          <button type="button" onClick={begin} disabled={pending || !environment.applicationConfigured}>
            {pending ? "Processando…" : environment.accountId ? "Reconectar iFood" : "Conectar iFood"}
          </button>
        )}
      </div>
    </article>
  );
}
