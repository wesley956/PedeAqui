import { revokePlatformSessionsAction, savePlatformAdminAction } from "@/features/platform-governance/actions";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../platform.module.css";

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nunca";

export default async function PlatformEquipePage() {
  const data = await PlatformBackofficeService.loadTeam();
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>SUPORTE E PLATAFORMA · EQUIPE INTERNA</p>
          <h1>Acessos administrativos do PedeAqui</h1>
          <p>Lista separada da equipe dos restaurantes. O sistema impede remover ou rebaixar o último super-admin e registra toda mudança na auditoria global.</p>
        </div>
        <span className={styles.roleBadge}>{data.rows.filter((item) => item.active).length} acesso(s) ativo(s)</span>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Adicionar acesso</h2><p>A conta precisa existir no PedeAqui antes de receber uma função de plataforma.</p></div></div>
        <form action={savePlatformAdminAction} className={styles.formGrid}>
          <input className={styles.field} name="email" type="email" placeholder="E-mail da conta" required />
          <select className={styles.field} name="role" defaultValue="support"><option value="support">Suporte</option><option value="super_admin">Super-admin</option></select>
          <select className={styles.field} name="active" defaultValue="true"><option value="true">Ativo</option><option value="false">Desativado</option></select>
          <button className={styles.button}>Salvar acesso</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Equipe da plataforma</h2><p>Nenhum usuário de restaurante vira administrador da plataforma apenas por pertencer a uma organização.</p></div></div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <details className={styles.details} key={item.user_id}>
              <summary>{item.email} · {item.role === "super_admin" ? "Super-admin" : "Suporte"} · {item.active ? "Ativo" : "Desativado"}</summary>
              <div className={styles.detailsBody}>
                <div className={styles.featureRow}>
                  <span><strong>{item.email}</strong><small>Último login: {dateTime(item.lastSignInAt)} · cadastrado em {dateTime(item.created_at)}</small></span>
                  <span className={styles.pill} data-tone={item.active ? "good" : "warn"}>{item.active ? "Ativo" : "Desativado"}</span>
                </div>
                <form action={savePlatformAdminAction} className={styles.formGrid}>
                  <input type="hidden" name="email" value={item.email} />
                  <select className={styles.field} name="role" defaultValue={item.role}><option value="support">Suporte</option><option value="super_admin">Super-admin</option></select>
                  <select className={styles.field} name="active" defaultValue={item.active ? "true" : "false"}><option value="true">Ativo</option><option value="false">Desativado</option></select>
                  <button className={styles.button}>Atualizar função</button>
                </form>
                <form action={revokePlatformSessionsAction}>
                  <input type="hidden" name="userId" value={item.user_id} />
                  <button className={styles.button} type="submit">Revogar sessões desta conta</button>
                </form>
                <p className={styles.advancedNote}>Revogar sessões força um novo login sem apagar a conta, suas permissões ou o histórico.</p>
              </div>
            </details>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhum administrador de plataforma cadastrado.</div> : null}
        </div>
      </section>
    </div>
  );
}
