import { AgentTokenCreator } from "@/features/printing/agent-token-creator";
import {
  cancelPrintJobAction,
  createPrinterAction,
  createPrintStationAction,
  linkProductStationAction,
  linkStationPrinterAction,
  reprintJobAction,
  retryPrintJobAction,
} from "@/features/printing/actions";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { PrintMonitorService } from "@/server/printing/print-monitor-service";
import { effectivePrintHealth, type PrintHealth } from "@/server/printing/printer-health";
import styles from "./printing.module.css";

const healthLabels: Record<PrintHealth, string> = {
  unknown: "Aguardando teste",
  online: "Online",
  offline: "Offline",
  degraded: "Precisa de atenção",
};
const jobLabels: Record<string, string> = {
  pending: "Aguardando",
  processing: "Imprimindo",
  printed: "Impresso",
  failed: "Não impresso",
  cancelled: "Cancelado",
};
const documentLabels: Record<string, string> = {
  kitchen: "Cozinha",
  expedition: "Expedição",
  counter: "Balcão",
  receipt: "Recibo",
  custom: "Personalizado",
};
const connectionLabels: Record<string, string> = {
  network: "Rede / Wi-Fi / Ethernet",
  usb: "USB pelo Windows",
  system: "Impressora instalada no Windows",
  bluetooth: "Bluetooth",
  cloud_agent: "Computador conectado",
};
const stationKindLabels: Record<string, string> = {
  production: "Produção",
  expedition: "Expedição",
  counter: "Balcão",
};

export default async function PrintingSettingsPage() {
  const [config, monitor] = await Promise.all([
    PrintConfigService.snapshot(),
    PrintMonitorService.current(100),
  ]);
  const stationMap = new Map(config.stations.map((item) => [item.id, item.name]));
  const printerMap = new Map(config.printers.map((item) => [item.id, item.name]));
  const linkedPrinter = new Set(config.stationPrinters.map((item) => `${item.station_id}:${item.printer_id}`));
  const linkedProduct = new Set(config.productStations.map((item) => `${item.product_id}:${item.station_id}`));
  const hasAgent = config.agents.some((agent) => agent.active);
  const hasPrinter = config.printers.some((printer) => printer.active);
  const hasRoute = config.stationPrinters.length > 0;

  return (
    <section className={styles.root}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Impressão de pedidos</p>
          <h1>Configure sua impressora em poucos passos</h1>
          <p className={styles.hint}>O PedeAqui cuida dos detalhes técnicos. Você só precisa conectar o computador, informar a impressora e escolher onde os pedidos devem sair.</p>
        </div>
        <div className={styles.checklist} aria-label="Progresso da configuração de impressão">
          <SetupCheck number="1" title="Computador" done={hasAgent} />
          <SetupCheck number="2" title="Impressora" done={hasPrinter} />
          <SetupCheck number="3" title="Destino" done={hasRoute} />
        </div>
      </header>

      <div className={styles.grid}>
        <article className={`card ${styles.card}`}>
          <StepHead number="1" title="Conecte o computador" text="Use o computador que fica no caixa ou próximo da impressora. Ele será a ponte segura entre o PedeAqui e a impressora física." />
          <AgentTokenCreator />
          <div className={styles.list}>
            {config.agents.map((agent) => {
              const health = effectivePrintHealth(agent.status as PrintHealth, agent.last_seen_at);
              return (
                <div className={styles.item} key={agent.id}>
                  <strong>{agent.name}</strong>
                  <Status health={health} text={`${healthLabels[health]}${agent.version ? ` · agente ${agent.version}` : ""}`} />
                </div>
              );
            })}
            {config.agents.length === 0 ? <Empty text="Nenhum computador conectado ainda." /> : null}
          </div>
          <details className={styles.advanced}>
            <summary>Como usar a chave de conexão?</summary>
            <div className={styles.advancedBody}>
              <p className={styles.hint}>No computador escolhido, execute o PedeAqui Print Agent e informe a URL do seu PedeAqui e a chave exibida acima. A chave aparece uma única vez por segurança.</p>
              <code>PEDEAQUI_URL=https://seu-pedeaqui<br />PEDEAQUI_PRINT_AGENT_TOKEN=sua-chave<br />npm start</code>
            </div>
          </details>
        </article>

        <article className={`card ${styles.card}`}>
          <StepHead number="2" title="Adicione a impressora" text="Para impressora USB, escolha a opção do Windows e informe exatamente o nome com que ela aparece em Impressoras e scanners. Para rede, informe o IP." />
          <form action={createPrinterAction} className={styles.form}>
            <Field name="name" label="Nome para identificar" placeholder="Ex.: Impressora da cozinha" required />
            <label className={styles.field}>
              <span>Como ela está conectada?</span>
              <select name="connectionType" defaultValue="system" className={styles.input}>
                <option value="system">USB / instalada no Windows</option>
                <option value="network">Rede / Wi-Fi / Ethernet</option>
              </select>
            </label>
            <Field name="connectionAddress" label="Nome no Windows ou IP" placeholder="Ex.: EPSON TM-T20 ou 192.168.1.50" required />
            <Field name="connectionPort" label="Porta (somente rede)" type="number" defaultValue="9100" min={1} max={65535} />
            <label className={styles.field}>
              <span>Largura do papel</span>
              <select name="paperWidthMm" defaultValue="80" className={styles.input}>
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
            </label>
            <Field name="defaultCopies" label="Cópias por pedido" type="number" defaultValue="1" min={1} max={10} />
            <label className={styles.field}>
              <span>Computador conectado</span>
              <select name="agentId" required defaultValue="" className={styles.input}>
                <option value="">Selecione o computador</option>
                {config.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Impressora alternativa</span>
              <select name="fallbackPrinterId" defaultValue="" className={styles.input}>
                <option value="">Nenhuma</option>
                {config.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}
              </select>
            </label>
            <button type="submit" className={`${styles.primary} ${styles.wide}`}>Adicionar impressora</button>
          </form>
          <div className={styles.printerGrid}>
            {config.printers.map((printer) => {
              const health = effectivePrintHealth(printer.status as PrintHealth, printer.last_seen_at);
              return (
                <div key={printer.id} className={styles.item}>
                  <strong>{printer.name}</strong>
                  <Status health={health} text={healthLabels[health]} />
                  <span className={styles.hint}>{connectionLabels[printer.connection_type] ?? "Conectada"} · {printer.paper_width_mm} mm · {printer.default_copies} cópia(s)</span>
                  {printer.last_error ? <span style={{ color: "#f97066", fontSize: 12 }}>A impressora informou uma falha. Confira o nome/IP, o computador e tente novamente.</span> : null}
                </div>
              );
            })}
            {config.printers.length === 0 ? <Empty text="Nenhuma impressora cadastrada ainda." /> : null}
          </div>
        </article>
      </div>

      <article className={`card ${styles.card}`}>
        <StepHead number="3" title="Escolha onde o pedido deve imprimir" text="Crie um local simples, como Cozinha, Chapa, Balcão ou Expedição, e ligue esse local à impressora correta." />
        <div className={styles.grid}>
          <div className={styles.list}>
            <h2>1. Criar local</h2>
            <form action={createPrintStationAction} className={styles.form}>
              <Field name="name" label="Nome" placeholder="Ex.: Cozinha" required />
              <Field name="code" label="Identificador" placeholder="cozinha" required pattern="[a-z0-9][a-z0-9_-]{1,39}" />
              <label className={styles.field}>
                <span>Uso</span>
                <select name="kind" defaultValue="production" className={styles.input}>
                  <option value="production">Produção</option>
                  <option value="expedition">Expedição</option>
                  <option value="counter">Balcão</option>
                </select>
              </label>
              <button type="submit" className={styles.primary}>Criar local</button>
            </form>
            {config.stations.map((station) => <div className={styles.item} key={station.id}><strong>{station.name}</strong><span className={styles.hint}>{stationKindLabels[station.kind] ?? "Operação"} · {station.active ? "ativo" : "inativo"}</span></div>)}
          </div>
          <div className={styles.list}>
            <h2>2. Ligar local à impressora</h2>
            <form action={linkStationPrinterAction} className={styles.form}>
              <label className={styles.field}>
                <span>Local</span>
                <select name="stationId" required className={styles.input}><option value="">Selecione</option>{config.stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select>
              </label>
              <label className={styles.field}>
                <span>Impressora</span>
                <select name="printerId" required className={styles.input}><option value="">Selecione</option>{config.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select>
              </label>
              <input type="hidden" name="priority" value="100" />
              <button type="submit" className={`${styles.primary} ${styles.wide}`}>Conectar local à impressora</button>
            </form>
            {config.stationPrinters.map((link) => <div className={styles.item} key={`${link.station_id}:${link.printer_id}`}><strong>{stationMap.get(link.station_id) ?? "Local"} → {printerMap.get(link.printer_id) ?? "Impressora"}</strong><span className={styles.hint}>{link.copies ? `${link.copies} cópia(s)` : "Usa a quantidade padrão da impressora"}</span></div>)}
            {config.stationPrinters.length === 0 ? <Empty text="Nenhum destino ligado a uma impressora ainda." /> : null}
          </div>
        </div>
      </article>

      <details className={styles.advanced}>
        <summary>Configuração avançada · direcionar produtos e acompanhar fila</summary>
        <div className={styles.advancedBody}>
          <article className={styles.list}>
            <h2>Produtos por local</h2>
            <p className={styles.hint}>Use somente se a operação tiver setores diferentes, por exemplo pizza em uma impressora e lanches em outra.</p>
            <form action={linkProductStationAction} className={styles.form}>
              <label className={styles.field}><span>Produto</span><select name="productId" required className={styles.input}><option value="">Selecione</option>{config.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <label className={styles.field}><span>Local de produção</span><select name="stationId" required className={styles.input}><option value="">Selecione</option>{config.stations.filter((station) => station.kind === "production").map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
              <button type="submit" className={`${styles.primary} ${styles.wide}`}>Definir destino do produto</button>
            </form>
            <span className={styles.hint}>{linkedProduct.size} produto(s) direcionado(s) · {linkedPrinter.size} vínculo(s) local/impressora.</span>
          </article>

          <article className={styles.list}>
            <h2>Fila de impressão</h2>
            <p className={styles.hint}>Pedidos normais não exigem ação. Use esta área apenas quando alguma impressão falhar ou precisar ser reimpressa.</p>
            {monitor.jobs.map((job) => (
              <div key={job.id} className={styles.queueRow}>
                <div>
                  <strong>{job.display_number ? `Pedido #${job.display_number}` : "Impressão avulsa"} · {documentLabels[job.document_type] ?? "Documento"}{job.is_reprint ? " · REIMPRESSÃO" : ""}</strong>
                  <div className={styles.hint}>{stationMap.get(job.station_id ?? "") ?? "Sem local definido"} → {printerMap.get(job.printer_id) ?? "Impressora"} · {jobLabels[job.status] ?? "Em processamento"} · {job.copies} cópia(s)</div>
                  {job.last_error ? <div style={{ color: "#f97066", fontSize: 12, marginTop: 3 }}>Não foi possível concluir esta impressão. Confira a impressora e tente novamente.</div> : null}
                </div>
                <div className={styles.actions}>
                  {job.status === "failed" ? <form action={retryPrintJobAction}><input type="hidden" name="jobId" value={job.id} /><button className={styles.secondary}>Tentar novamente</button></form> : null}
                  {job.status === "pending" || job.status === "failed" ? <form action={cancelPrintJobAction}><input type="hidden" name="jobId" value={job.id} /><button className={styles.danger}>Cancelar</button></form> : null}
                  <form action={reprintJobAction} style={{ display: "flex", gap: 5, flexWrap: "wrap" }}><input type="hidden" name="jobId" value={job.id} /><input name="reason" required minLength={3} maxLength={500} placeholder="Motivo" className={styles.input} /><button className={styles.secondary}>Reimprimir</button></form>
                </div>
              </div>
            ))}
            {monitor.jobs.length === 0 ? <Empty text="Nenhuma impressão na fila." /> : null}
          </article>
        </div>
      </details>
    </section>
  );
}

function StepHead({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className={styles.stepHead}><span className={styles.stepNumber}>{number}</span><div><h2>{title}</h2><p className={styles.hint}>{text}</p></div></div>;
}

function SetupCheck({ number, title, done }: { number: string; title: string; done: boolean }) {
  return <div className={`${styles.check} ${done ? styles.checkDone : ""}`}><span className={styles.dot}>{done ? "✓" : number}</span><div><strong>{title}</strong><div className={styles.hint}>{done ? "Pronto" : "Pendente"}</div></div></div>;
}

function Status({ health, text }: { health: PrintHealth; text: string }) {
  const color = health === "online" ? "#12b76a" : health === "offline" || health === "degraded" ? "#f04438" : "#98a2b3";
  return <span className={styles.status} style={{ color }}><span className={styles.statusDot} />{text}</span>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return <label className={styles.field}><span>{label}</span><input {...input} className={styles.input} /></label>;
}

function Empty({ text }: { text: string }) {
  return <div className={styles.item}><span className={styles.hint}>{text}</span></div>;
}
