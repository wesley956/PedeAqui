import { Button } from "@/components/ui/button";
import { Checkbox, Input, SelectField } from "@/components/ui/form-controls";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { ConfirmTeamActionButton } from "@/features/team/confirm-team-action-button";
import {
  cancelTeamInvitationAction,
  createTeamInvitationFormAction,
  suspendTeamMemberAction,
} from "@/features/team/actions";
import { TeamManagementService } from "@/server/team/team-management-service";
import styles from "./team.module.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const statusLabels = { active: "Ativo", invited: "Convidado", suspended: "Suspenso" } as const;
const inviteLabels = { pending: "Pendente", accepted: "Aceito", expired: "Expirado/cancelado" } as const;

export default async function TeamPage() {
  const state = await TeamManagementService.load();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>EQUIPE E ACESSOS</p><h1>Equipe</h1><p>Veja quem trabalha no PedeAqui, qual função cada pessoa possui e em quais unidades pode entrar.</p></div>
        <span className={styles.count}>{state.members.length} funcionário(s)</span>
      </header>

      <div className={styles.grid}>
        <section className={`card ${styles.invite}`} aria-labelledby="team-invite-title">
          <div><h2 id="team-invite-title">Convidar funcionário</h2><p>Crie um convite e envie o link somente para a pessoa informada.</p></div>
          <ResilientMutationForm action={createTeamInvitationFormAction} className={styles.form}>
            <Input label="E-mail" name="email" type="email" required autoComplete="email" />
            <SelectField label="Função" name="roleId" required defaultValue="">
              <option value="" disabled>Selecione uma função</option>
              {state.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </SelectField>
            <fieldset className={styles.stores}>
              <legend>Unidades permitidas</legend>
              {state.stores.map((store, index) => <Checkbox key={store.id} label={store.name} name="storeIds" value={store.id} defaultChecked={index === 0} />)}
            </fieldset>
            <Button type="submit">Criar convite</Button>
          </ResilientMutationForm>
        </section>

        <div className={styles.content}>
          <section className={styles.section} aria-labelledby="team-members-title">
            <div className={styles.sectionHeader}><h2 id="team-members-title">Funcionários</h2><span>Acessos atuais</span></div>
            <div className={styles.list}>
              {state.members.length === 0 ? <div className={styles.empty}>Nenhum funcionário encontrado.</div> : state.members.map((member) => (
                <article key={member.id} className={styles.member}>
                  <div className={styles.identity}>
                    <strong>{member.email}</strong><span className={styles.status} data-active={member.status === "active" || undefined}>{statusLabels[member.status as keyof typeof statusLabels] ?? member.status}</span>
                    <div className={styles.meta}>{member.roleNames.join(" · ") || "Sem função ativa"}</div>
                    <small className={styles.small}>Unidades: {member.storeNames.join(", ") || "acesso organizacional"} · Entrada: {dateFormatter.format(new Date(member.joinedAt))}</small>
                  </div>
                  {member.canSuspend ? <form action={suspendTeamMemberAction}><input type="hidden" name="memberId" value={member.id} /><ConfirmTeamActionButton tone="danger" confirmation="Suspender este acesso? O histórico será preservado.">Suspender acesso</ConfirmTeamActionButton></form> : null}
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="team-invites-title">
            <div className={styles.sectionHeader}><h2 id="team-invites-title">Convites</h2><span>{state.invitations.length} registro(s)</span></div>
            <div className={styles.list}>
              {state.invitations.length === 0 ? <div className={styles.empty}>Nenhum convite criado.</div> : state.invitations.map((invitation) => (
                <article key={invitation.id} className={styles.inviteRow}>
                  <div className={styles.identity}><strong>{invitation.email}</strong><div className={styles.meta}>{invitation.roleName} · {invitation.storeNames.join(", ") || "sem unidade"}</div><small className={styles.small}>{inviteLabels[invitation.status]} · vence em {dateFormatter.format(new Date(invitation.expiresAt))}</small></div>
                  {invitation.status === "pending" ? <form action={cancelTeamInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><ConfirmTeamActionButton confirmation="Cancelar este convite pendente?">Cancelar convite</ConfirmTeamActionButton></form> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
