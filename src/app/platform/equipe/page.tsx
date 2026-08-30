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
          <p>Lista separada da equipe dos restaurantes. Super-admin administra produto e contratos; suporte mantém acesso limitado às capacidades autorizadas.</p>
        </div>
        <span className={styles.roleBadge}>{data.rows.filter((item) => item.active).length} acesso(s) ativo(s)</span>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Equipe da plataforma</h2><p>Nenhum usuário de restaurante vira administrador da plataforma por pertencer a uma organização.</p></div></div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <div className={styles.featureRow} key={item.user_id}>
              <span>
                <strong>{item.email}</strong>
                <small>Último login: {dateTime(item.lastSignInAt)} · cadastrado em {dateTime(item.created_at)}</small>
              </span>
              <span style={{ alignItems: "flex-end" }}>
                <span className={styles.pill} data-tone={item.active ? "good" : "warn"}>{item.active ? "Ativo" : "Desativado"}</span>
                <strong>{item.role === "super_admin" ? "Super-admin" : "Suporte"}</strong>
              </span>
            </div>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhum administrador de plataforma cadastrado.</div> : null}
        </div>
      </section>
    </div>
  );
}
