import Link from "next/link";
import { setPrinterActiveAction, unlinkPrinterAction } from "@/features/printing/connection-actions";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { effectivePrintHealth, type PrintHealth } from "@/server/printing/printer-health";
import styles from "../printing.module.css";

const healthLabels: Record<PrintHealth, string> = {
  unknown: "Aguardando comunicação",
  online: "Online",
  offline: "Offline",
  degraded: "Precisa de atenção",
};

const connectionLabels: Record<string, string> = {
  network: "Rede / Wi-Fi / Ethernet",
  usb: "USB pelo Windows",
  system: "Instalada no Windows",
  bluetooth: "Bluetooth",
  cloud_agent: "Computador conectado",
};

const successLabels: Record<string, string> = {
  activated: "Impressora ativada novamente.",
  deactivated: "Impressora desativada. A configuração foi mantida e ela não receberá novas impressões.",
  unlinked: "Impressora desvinculada do computador. O registro foi preservado para histórico e auditoria.",
};

export default async function ManagePrinterConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const config = await PrintConfigService.snapshot();
  const agentNames = new Map(config.agents.map((agent) => [agent.id, agent.name]));

  return (
    <section className={styles.root}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Conexões de impressão</p>
          <h1>Gerenciar impressoras</h1>
          <p className={styles.hint}>Desative temporariamente sem perder a configuração, reative quando precisar ou desvincule a impressora do computador com confirmação.</p>
        </div>
      </header>

      {params.status && successLabels[params.status] ? (
        <div className={styles.successBanner} role="status">
          <strong>Alteração concluída ✓</strong>
          <span>{successLabels[params.status]}</span>
        </div>
      ) : null}

      <article className={`card ${styles.card}`}>
        <div className={styles.stepTopline}>
          <div>
            <h2>Impressoras cadastradas</h2>
            <p className={styles.hint}>Desativar é reversível e não altera papel, quantidade de vias ou demais configurações.</p>
          </div>
          <Link className={styles.secondaryLink} href="/configuracoes/impressoes">Voltar para impressão</Link>
        </div>

        <div className={styles.printerGrid}>
          {config.printers.map((printer) => {
            const linked = Boolean(printer.agent_id) || printer.connection_type === "network";
            const health = effectivePrintHealth(printer.status as PrintHealth, printer.last_seen_at);
            return (
              <div key={printer.id} className={styles.printerCard}>
                <div className={styles.detectedTitle}>
                  <div>
                    <strong>{printer.name}</strong>
                    <div className={styles.hint}>{printer.active ? "Ativa" : linked ? "Inativa" : "Desvinculada"}</div>
                  </div>
                  <Status health={health} text={printer.active ? healthLabels[health] : linked ? "Desativada" : "Desvinculada"} />
                </div>

                <span className={styles.hint}>{connectionLabels[printer.connection_type] ?? "Conectada"} · {printer.paper_width_mm} mm · {printer.default_copies} cópia(s)</span>
                <span className={styles.hint}>{printer.agent_id ? `Computador: ${agentNames.get(printer.agent_id) ?? "Conectado"}` : printer.connection_type === "network" ? "Conexão direta por rede" : "Sem computador vinculado"}</span>
                {printer.connection_address ? <span className={styles.hint}>Destino: {printer.connection_address}</span> : null}

                <div className={styles.actions}>
                  {linked ? (
                    <form action={setPrinterActiveAction}>
                      <input type="hidden" name="printerId" value={printer.id} />
                      <input type="hidden" name="active" value={printer.active ? "false" : "true"} />
                      <button type="submit" className={printer.active ? styles.secondary : styles.primary}>{printer.active ? "Desativar" : "Ativar novamente"}</button>
                    </form>
                  ) : null}
                </div>

                {printer.agent_id ? (
                  <details className={styles.inlineDetails}>
                    <summary>Desvincular impressora</summary>
                    <div className={styles.detailsBody}>
                      <form action={unlinkPrinterAction} className={styles.list}>
                        <input type="hidden" name="printerId" value={printer.id} />
                        <p className={styles.warningText}>Isto desativa a impressora e remove a associação com este computador. Para usá-la de novo, será necessário conectá-la novamente.</p>
                        <label className={styles.hint}>
                          <input type="checkbox" name="confirmUnlink" required /> Eu confirmo que quero desvincular esta impressora.
                        </label>
                        <button type="submit" className={styles.danger}>Confirmar desvínculo</button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
          {config.printers.length === 0 ? <div className={styles.empty}><span aria-hidden>○</span><span>Nenhuma impressora cadastrada.</span></div> : null}
        </div>
      </article>
    </section>
  );
}

function Status({ health, text }: { health: PrintHealth; text: string }) {
  return <span className={styles.status} data-health={health}><span className={styles.statusDot} aria-hidden />{text}</span>;
}
