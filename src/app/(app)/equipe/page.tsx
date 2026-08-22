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

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const statusLabels = { active: "Ativo", invited: "Convidado", suspended: "Suspenso" } as const;
const inviteLabels = { pending: "Pendente", accepted: "Aceito", expired: "Expirado/cancelado" } as const;

export default async function TeamPage() {
  const state = await TeamManagementService.load();

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ marginBottom: 6 }}>Equipe</h1>
        <p className="muted" style={{ margin: 0 }}>Convide pessoas, acompanhe acessos e suspenda funcionários sem apagar o histórico.</p>
      </header>

      <section className="card" style={{ padding: 18, display: "grid", gap: 14 }} aria-labelledby="team-invite-title">
        <div>
          <h2 id="team-invite-title" style={{ marginBottom: 4 }}>Convidar funcionário</h2>
          <p className="muted" style={{ margin: 0 }}>O link aparece uma única vez. Envie somente para a pessoa informada.</p>
        </div>
        <ResilientMutationForm action={createTeamInvitationFormAction} style={{ display: "grid", gap: 12 }}>
          <Input label="E-mail" name="email" type="email" required autoComplete="email" />
          <SelectField label="Função" name="roleId" required defaultValue="">
            <option value="" disabled>Selecione uma função</option>
            {state.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </SelectField>
          <fieldset style={{ border: 0, padding: 0, display: "grid", gap: 8 }}>
            <legend style={{ marginBottom: 6, fontWeight: 700 }}>Unidades permitidas</legend>
            {state.stores.map((store, index) => (
              <Checkbox key={store.id} label={store.name} name="storeIds" value={store.id} defaultChecked={index === 0} />
            ))}
          </fieldset>
          <Button type="submit">Criar convite</Button>
        </ResilientMutationForm>
      </section>

      <section style={{ display: "grid", gap: 10 }} aria-labelledby="team-members-title">
        <h2 id="team-members-title" style={{ marginBottom: 0 }}>Funcionários</h2>
        {state.members.length === 0 ? <p className="muted">Nenhum funcionário encontrado.</p> : state.members.map((member) => (
          <article className="card" key={member.id} style={{ padding: 16, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{member.email}</strong>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {member.roleNames.join(" · ") || "Sem função ativa"} · {statusLabels[member.status as keyof typeof statusLabels] ?? member.status}
                </p>
              </div>
              {member.canSuspend ? (
                <form action={suspendTeamMemberAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <ConfirmTeamActionButton tone="danger" confirmation="Suspender este acesso? O histórico será preservado.">Suspender acesso</ConfirmTeamActionButton>
                </form>
              ) : null}
            </div>
            <small className="muted">Unidades: {member.storeNames.join(", ") || "acesso organizacional"} · Entrada: {dateFormatter.format(new Date(member.joinedAt))}</small>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gap: 10 }} aria-labelledby="team-invites-title">
        <h2 id="team-invites-title" style={{ marginBottom: 0 }}>Convites</h2>
        {state.invitations.length === 0 ? <p className="muted">Nenhum convite criado.</p> : state.invitations.map((invitation) => (
          <article className="card" key={invitation.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong>{invitation.email}</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>{invitation.roleName} · {invitation.storeNames.join(", ") || "sem unidade"}</p>
              <small className="muted">{inviteLabels[invitation.status]} · vence em {dateFormatter.format(new Date(invitation.expiresAt))}</small>
            </div>
            {invitation.status === "pending" ? (
              <form action={cancelTeamInvitationAction}>
                <input type="hidden" name="invitationId" value={invitation.id} />
                <ConfirmTeamActionButton confirmation="Cancelar este convite pendente?">Cancelar convite</ConfirmTeamActionButton>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
