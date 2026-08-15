import { randomUUID } from "node:crypto";
import {
  supportPasswordRecoveryAction,
  supportReactivateMembershipAction,
  supportReissueInvitationAction,
  supportReplaceStoreRoleAction,
} from "@/features/platform-account-support/actions";
import { PlatformAccountSupportService } from "@/server/platform/platform-account-support-service";
import styles from "../platform.module.css";

const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem atividade registrada";
const inviteState: Record<string, string> = { pending: "Pendente", expired: "Expirado", accepted: "Aceito" };

export default async function PlatformSupportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const state = await PlatformAccountSupportService.load(query);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Contas e acessos</p>
          <h1>Central de Suporte</h1>
          <p>Diagnostique convites, vínculos, funções e acesso às unidades sem visualizar senhas nem assumir a sessão do cliente.</p>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Resumo de contas e acessos">
        <article className={styles.metric}><span>Membros ativos</span><strong>{state.totals.activeMembers}</strong></article>
        <article className={styles.metric}><span>Atenção em vínculo</span><strong>{state.totals.inactiveMembers}</strong></article>
        <article className={styles.metric}><span>Convites pendentes</span><strong>{state.totals.pendingInvites}</strong></article>
        <article className={styles.metric}><span>Convites expirados</span><strong>{state.totals.expiredInvites}</strong></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Localizar conta</h2><p>Busque por empresa, unidade ou e-mail. O resultado exibido mantém o e-mail mascarado.</p></div>
        </div>
        <form className={styles.search} action="/platform/suporte">
          <input className={styles.field} name="q" defaultValue={query} placeholder="Empresa, unidade ou e-mail" />
          <button className={styles.button} type="submit">Buscar</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Usuários e permissões</h2><p>Funções efetivas são lidas pelos vínculos reais de cada unidade.</p></div>
          <span className={styles.pill} data-tone={state.canMutateAccess ? "warn" : "neutral"}>{state.canMutateAccess ? "Super admin" : "Suporte — leitura"}</span>
        </div>
        {state.members.length === 0 ? <p className={styles.empty}>Nenhum usuário encontrado para este filtro.</p> : (
          <div className={styles.orgGrid}>
            {state.members.map((member) => {
              const stores = state.stores.filter((item) => item.organizationId === member.organizationId);
              const roles = state.roles.filter((item) => item.organizationId === member.organizationId);
              return (
                <article className={styles.orgCard} key={member.memberId}>
                  <div className={styles.cardTop}>
                    <div><strong>{member.emailMasked}</strong><span>{member.organizationName}</span></div>
                    <span className={styles.pill} data-tone={member.status === "active" ? "ok" : "warn"}>{member.status === "active" ? "Ativo" : "Ação necessária"}</span>
                  </div>
                  <p className={styles.meta}>Última atividade: {date(member.lastSignInAt)}</p>
                  <p className={styles.meta}>Conta de autenticação: {member.accountExists ? "localizada" : "não localizada"}</p>
                  {member.assignments.length ? member.assignments.map((assignment) => (
                    <div className={styles.detailsBody} key={`${member.memberId}:${assignment.storeId}`}>
                      <strong>{assignment.storeName}</strong>
                      <span className={styles.meta}>{assignment.roleName} · {assignment.permissions.length} permissão(ões) efetiva(s)</span>
                    </div>
                  )) : <p className={styles.advancedNote}>Sem acesso a nenhuma unidade. Um super admin pode criar um vínculo abaixo.</p>}

                  {member.accountExists ? (
                    <details className={styles.details}>
                      <summary>Enviar recuperação de senha</summary>
                      <form action={supportPasswordRecoveryAction} className={styles.detailsBody}>
                        <Common organizationId={member.organizationId} entityName="memberId" entityId={member.memberId} />
                        <p className={styles.advancedNote}>O PedeAqui envia o fluxo oficial de recuperação. A senha atual nunca fica visível para o suporte.</p>
                        <button className={styles.button}>Enviar recuperação</button>
                      </form>
                    </details>
                  ) : null}

                  {state.canMutateAccess && member.status !== "active" ? (
                    <details className={styles.details}>
                      <summary>Reativar vínculo com a empresa</summary>
                      <form action={supportReactivateMembershipAction} className={styles.detailsBody}>
                        <Common organizationId={member.organizationId} entityName="memberId" entityId={member.memberId} />
                        <button className={styles.button}>Reativar com auditoria</button>
                      </form>
                    </details>
                  ) : null}

                  {state.canMutateAccess && stores.length && roles.length ? (
                    <details className={styles.details}>
                      <summary>Corrigir acesso a uma unidade</summary>
                      <form action={supportReplaceStoreRoleAction} className={styles.detailsBody}>
                        <Common organizationId={member.organizationId} entityName="memberId" entityId={member.memberId} />
                        <label>Unidade<select className={styles.field} name="storeId" required>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
                        <label>Função<select className={styles.field} name="roleId" required>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                        <label>Confirmação<input className={styles.field} name="confirmation" required placeholder="Digite ALTERAR ACESSO" pattern="ALTERAR ACESSO" /></label>
                        <p className={styles.advancedNote}>A função owner não é oferecida nesta central. Mudanças de proprietário exigem um fluxo administrativo reforçado.</p>
                        <button className={styles.button}>Aplicar acesso auditado</button>
                      </form>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Convites</h2><p>Convites pendentes ou expirados podem ser reemitidos mantendo exatamente a empresa, função e unidades já aprovadas.</p></div></div>
        {state.invitations.length === 0 ? <p className={styles.empty}>Nenhum convite encontrado.</p> : (
          <div className={styles.orgGrid}>
            {state.invitations.map((invite) => (
              <article className={styles.orgCard} key={invite.invitationId}>
                <div className={styles.cardTop}><div><strong>{invite.emailMasked}</strong><span>{invite.organizationName}</span></div><span className={styles.pill} data-tone={invite.state === "pending" ? "ok" : invite.state === "expired" ? "warn" : "neutral"}>{inviteState[invite.state]}</span></div>
                <p className={styles.meta}>{invite.roleName} · {invite.storeNames.join(" · ") || "Sem unidade"}</p>
                <p className={styles.meta}>Validade: {date(invite.expiresAt)}</p>
                {invite.state !== "accepted" && invite.roleKey !== "owner" ? (
                  <details className={styles.details}>
                    <summary>Reemitir convite</summary>
                    <form action={supportReissueInvitationAction} className={styles.detailsBody}>
                      <Common organizationId={invite.organizationId} entityName="invitationId" entityId={invite.invitationId} />
                      <p className={styles.advancedNote}>O token anterior é invalidado. O novo acesso é entregue pelo fluxo de autenticação sem mostrar o token ao operador.</p>
                      <button className={styles.button}>Reemitir convite</button>
                    </form>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Sessões</h2><p>Recuperação e revogação seguem apenas os mecanismos oficiais do provedor de autenticação.</p></div></div>
        <p className={styles.advancedNote}>A revogação administrativa direta de uma sessão específica não é oferecida porque o contrato atual exige o JWT da própria sessão-alvo. A central não coleta nem expõe esse token. Use a recuperação oficial de acesso enquanto não houver um mecanismo de revogação por usuário que preserve essa segurança.</p>
      </section>
    </div>
  );
}

function Common({ organizationId, entityName, entityId }: { organizationId: string; entityName: string; entityId: string }) {
  return <>
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name={entityName} value={entityId} />
    <input type="hidden" name="idempotencyKey" value={`account-support:${randomUUID()}`} />
    <label>Motivo da intervenção<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: cliente confirmou perda de acesso" /></label>
    <label>Protocolo/chamado<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: SUP-2026-001" /></label>
  </>;
}
