import Link from "next/link";
import { AgentReconnectInstaller, AgentTokenCreator } from "@/features/printing/agent-token-creator";
import {
  cancelPrintJobAction,
  createPrinterAction,
  createPrintStationAction,
  enqueuePrinterTestAction,
  linkProductStationAction,
  linkStationPrinterAction,
  quickSetupDetectedPrinterAction,
  reprintJobAction,
  retryPrintJobAction,
} from "@/features/printing/actions";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { PrintMonitorService } from "@/server/printing/print-monitor-service";
import { effectivePrintHealth, type PrintHealth } from "@/server/printing/printer-health";
import styles from "./printing.module.css";

const healthLabels: Record<PrintHealth, string> = {
  unknown: "Aguardando comunicação",
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
  custom: "Teste / personalizado",
};
const connectionLabels: Record<string, string> = {
  network: "Rede / Wi-Fi / Ethernet",
  usb: "USB pelo Windows",
  system: "Instalada no Windows",
  bluetooth: "Bluetooth",
  cloud_agent: "Computador conectado",
};
const stationKindLabels: Record<string, string> = {
  production: "Produção",
  expedition: "Expedição",
  counter: "Balcão / todos os pedidos",
};

type DetectedPrinter = {
  name: string;
  isDefault: boolean;
  workOffline: boolean;
  status: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function detectedPrinters(capabilities: unknown): DetectedPrinter[] {
  const source = record(capabilities)?.discoveredPrinters;
  if (!Array.isArray(source)) return [];
  return source.flatMap((value) => {
    const item = record(value);
    const name = String(item?.name ?? "").trim();
    if (!name) return [];
    return [{
      name,
      isDefault: Boolean(item?.isDefault),
      workOffline: Boolean(item?.workOffline),
      status: Number(item?.status ?? 0),
    }];
  });
}

function supportsAutoDiscovery(capabilities: unknown) {
  return record(capabilities)?.autoDiscovery === true;
}

function isVirtualPrinter(name: string) {
  const value = name.toLowerCase();
  return ["pdf", "xps", "onenote", "fax", "microsoft print", "send to"].some((term) => value.includes(term));
}

export default async function PrintingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; test?: string }>;
}) {
  const params = await searchParams;
  const [config, monitor] = await Promise.all([
    PrintConfigService.snapshot(),
    PrintMonitorService.current(100),
  ]);
  const stationMap = new Map(config.stations.map((item) => [item.id, item.name]));
  const printerMap = new Map(config.printers.map((item) => [item.id, item.name]));
  const linkedPrinter = new Set(config.stationPrinters.map((item) => `${item.station_id}:${item.printer_id}`));
  const linkedProduct = new Set(config.productStations.map((item) => `${item.product_id}:${item.station_id}`));
  const routedPrinterIds = new Set(config.stationPrinters.filter((item) => item.active).map((item) => item.printer_id));
  const connectedAgentIds = new Set(config.agents.filter((agent) => {
    const health = effectivePrintHealth(agent.status as PrintHealth, agent.last_seen_at);
    return agent.active && (health === "online" || health === "degraded");
  }).map((agent) => agent.id));
  const activePrinters = config.printers.filter((printer) => printer.active);
  const onlinePrinters = activePrinters.filter((printer) => effectivePrintHealth(printer.status as PrintHealth, printer.last_seen_at) === "online");
  const hasAgent = connectedAgentIds.size > 0;
  const hasPrinter = activePrinters.length > 0;
  const hasRoute = activePrinters.some((printer) => routedPrinterIds.has(printer.id));
  const printingReady = onlinePrinters.some((printer) => routedPrinterIds.has(printer.id));
  const configuredWindowsPrinters = new Set(activePrinters
    .filter((printer) => printer.agent_id && (printer.connection_type === "system" || printer.connection_type === "usb"))
    .map((printer) => `${printer.agent_id}:${printer.connection_address ?? printer.name}`));

  const candidates = config.agents
    .filter((agent) => agent.active)
    .flatMap((agent) => detectedPrinters(agent.capabilities).map((printer) => ({
      ...printer,
      agentId: agent.id,
      agentName: agent.name,
      agentOnline: connectedAgentIds.has(agent.id),
      configured: configuredWindowsPrinters.has(`${agent.id}:${printer.name}`),
      virtual: isVirtualPrinter(printer.name),
    })))
    .sort((a, b) => Number(a.virtual) - Number(b.virtual) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

  return (
    <section className={styles.root}>
      <header className={`${styles.hero} ${printingReady ? styles.heroReady : ""}`}>
        <div>
          <p className={styles.eyebrow}>Impressão de pedidos</p>
          <h1>{printingReady ? "Impressão funcionando" : "Vamos conectar sua impressora"}</h1>
          <p className={styles.hint}>{printingReady
            ? "O PedeAqui está recebendo comunicação da impressora e o destino dos pedidos está configurado."
            : "No modo simples você conecta o computador, escolhe uma impressora encontrada automaticamente e faz um teste. O restante fica por conta do PedeAqui."}</p>
        </div>
        <div className={styles.checklist} aria-label="Progresso da configuração de impressão">
          <SetupCheck number="1" title="Computador" done={hasAgent} />
          <SetupCheck number="2" title="Impressora" done={hasPrinter && hasRoute} />
          <SetupCheck number="3" title="Funcionando" done={printingReady} />
        </div>
      </header>

      {params.setup === "printer_ready" ? (
        <div className={styles.successBanner} role="status">
          <strong>Impressora adicionada ✓</strong>
          <span>O destino padrão “Pedidos” foi preparado automaticamente. Agora faça a impressão de teste.</span>
        </div>
      ) : null}
      {params.test === "queued" ? (
        <div className={styles.successBanner} role="status">
          <strong>Teste enviado para a impressora ✓</strong>
          <span>Aguarde alguns segundos. Se sair um papel com “PedeAqui — impressora configurada com sucesso”, terminou.</span>
        </div>
      ) : null}

      <article className={`card ${styles.card}`}>
        <StepHead number="1" title="Conecte o computador" text="Faça isto no computador do caixa ou no computador que fica perto da impressora. Não é necessário copiar comandos nem configurar o sistema manualmente." />

        {config.agents.length === 0 ? <AgentTokenCreator /> : null}

        <div className={styles.list}>
          {config.agents.map((agent) => {
            const health = effectivePrintHealth(agent.status as PrintHealth, agent.last_seen_at);
            const modern = supportsAutoDiscovery(agent.capabilities);
            return (
              <div className={styles.computerRow} key={agent.id}>
                <div className={styles.itemMain}>
                  <strong>{agent.name}</strong>
                  <Status health={health} text={`${healthLabels[health]}${agent.version ? ` · versão ${agent.version}` : ""}`} />
                  {!modern ? <span className={styles.hint}>Este computador ainda usa o modo antigo. Atualize a conexão para o PedeAqui encontrar as impressoras sozinho.</span> : null}
                </div>
                {(!modern || health === "offline" || health === "unknown") ? <AgentReconnectInstaller agentId={agent.id} /> : null}
              </div>
            );
          })}
        </div>

        {config.agents.length > 0 ? (
          <details className={styles.inlineDetails}>
            <summary>Conectar outro computador</summary>
            <div className={styles.detailsBody}><AgentTokenCreator /></div>
          </details>
        ) : null}
      </article>

      <article className={`card ${styles.card}`}>
        <div className={styles.stepTopline}>
          <StepHead number="2" title="Escolha a impressora" text="O PedeAqui procura automaticamente as impressoras instaladas no Windows. Você só precisa escolher qual será usada." />
          <Link className={styles.secondaryLink} href="/configuracoes/impressoes?atualizar=1">Atualizar impressoras</Link>
        </div>

        {!hasAgent ? (
          <Empty text="Primeiro conecte o computador acima. Quando ele ficar Online, as impressoras aparecerão aqui." />
        ) : candidates.length === 0 ? (
          <div className={styles.emptyGuide}>
            <strong>Nenhuma impressora encontrada ainda.</strong>
            <span className={styles.hint}>Confirme que a impressora está instalada no Windows e ligada. Se o computador estiver em uma versão antiga, use “Atualizar conexão” acima.</span>
            <Link className={styles.secondaryLink} href="/configuracoes/impressoes?atualizar=2">Procurar novamente</Link>
          </div>
        ) : (
          <div className={styles.detectedGrid}>
            {candidates.map((candidate) => (
              <div className={`${styles.detectedPrinter} ${candidate.configured ? styles.detectedConfigured : ""}`} key={`${candidate.agentId}:${candidate.name}`}>
                <div className={styles.detectedTitle}>
                  <div>
                    <strong>{candidate.name}</strong>
                    <div className={styles.hint}>{candidate.agentName}{candidate.isDefault ? " · padrão do Windows" : ""}{candidate.virtual ? " · impressora virtual" : ""}</div>
                  </div>
                  <span className={candidate.configured ? styles.readyPill : styles.foundPill}>{candidate.configured ? "Em uso" : "Encontrada"}</span>
                </div>
                {candidate.workOffline ? <span className={styles.warningText}>O Windows informa que esta impressora está offline.</span> : null}
                {!candidate.configured ? (
                  <form action={quickSetupDetectedPrinterAction} className={styles.quickForm}>
                    <input type="hidden" name="agentId" value={candidate.agentId} />
                    <input type="hidden" name="printerName" value={candidate.name} />
                    <label className={styles.field}>
                      <span>Papel</span>
                      <select name="paperWidthMm" defaultValue="80" className={styles.input}>
                        <option value="80">80 mm</option>
                        <option value="58">58 mm</option>
                      </select>
                    </label>
                    <button type="submit" className={styles.primary} disabled={!candidate.agentOnline}>Usar esta impressora</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </article>

      <article className={`card ${styles.card}`}>
        <StepHead number="3" title="Faça uma impressão de teste" text="Toque no botão e espere alguns segundos. Se o comprovante de teste sair, a configuração básica acabou." />
        <div className={styles.printerGrid}>
          {activePrinters.map((printer) => {
            const health = effectivePrintHealth(printer.status as PrintHealth, printer.last_seen_at);
            const routed = routedPrinterIds.has(printer.id);
            return (
              <div key={printer.id} className={styles.printerCard}>
                <div className={styles.detectedTitle}>
                  <strong>{printer.name}</strong>
                  <Status health={health} text={healthLabels[health]} />
                </div>
                <span className={styles.hint}>{connectionLabels[printer.connection_type] ?? "Conectada"} · {printer.paper_width_mm} mm · {printer.default_copies} cópia(s)</span>
                <span className={styles.hint}>{routed ? "Pedidos direcionados para esta impressora" : "Sem destino automático; configure no modo avançado"}</span>
                {printer.last_error ? <span className={styles.warningText}>A impressora informou uma falha. Confira se está ligada e tente novamente.</span> : null}
                {printer.agent_id ? (
                  <form action={enqueuePrinterTestAction}>
                    <input type="hidden" name="printerId" value={printer.id} />
                    <button type="submit" className={styles.primary}>Imprimir teste</button>
                  </form>
                ) : <span className={styles.warningText}>Conecte esta impressora a um computador antes de testar.</span>}
              </div>
            );
          })}
          {activePrinters.length === 0 ? <Empty text="Escolha uma impressora na etapa 2 para liberar o teste." /> : null}
        </div>
        {printingReady ? (
          <div className={styles.readyBox}>
            <strong>Pronto para receber pedidos ✓</strong>
            <span>Para uma operação com uma única impressora, você não precisa configurar mais nada.</span>
          </div>
        ) : null}
      </article>

      <details className={styles.advanced}>
        <summary>Configuração avançada</summary>
        <div className={styles.advancedBody}>
          <p className={styles.hint}>Use esta área somente se tiver impressora de rede/IP, várias impressoras, setores diferentes ou precisar direcionar produtos específicos.</p>

          <div className={styles.grid}>
            <article className={styles.list}>
              <h2>Adicionar impressora manualmente</h2>
              <form action={createPrinterAction} className={styles.form}>
                <Field name="name" label="Nome para identificar" placeholder="Ex.: Impressora da cozinha" required />
                <label className={styles.field}>
                  <span>Conexão</span>
                  <select name="connectionType" defaultValue="network" className={styles.input}>
                    <option value="network">Rede / Wi-Fi / Ethernet</option>
                    <option value="system">Instalada no Windows</option>
                  </select>
                </label>
                <Field name="connectionAddress" label="IP ou nome no Windows" placeholder="Ex.: 192.168.1.50" required />
                <Field name="connectionPort" label="Porta (rede)" type="number" defaultValue="9100" min={1} max={65535} />
                <label className={styles.field}>
                  <span>Largura do papel</span>
                  <select name="paperWidthMm" defaultValue="80" className={styles.input}><option value="80">80 mm</option><option value="58">58 mm</option></select>
                </label>
                <Field name="defaultCopies" label="Cópias por pedido" type="number" defaultValue="1" min={1} max={10} />
                <label className={styles.field}>
                  <span>Computador</span>
                  <select name="agentId" required defaultValue="" className={styles.input}><option value="">Selecione</option>{config.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                </label>
                <label className={styles.field}>
                  <span>Impressora alternativa</span>
                  <select name="fallbackPrinterId" defaultValue="" className={styles.input}><option value="">Nenhuma</option>{config.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select>
                </label>
                <button type="submit" className={`${styles.primary} ${styles.wide}`}>Adicionar manualmente</button>
              </form>
            </article>

            <article className={styles.list}>
              <h2>Locais de impressão</h2>
              <p className={styles.hint}>Ex.: Cozinha, Chapa, Balcão ou Expedição.</p>
              <form action={createPrintStationAction} className={styles.form}>
                <Field name="name" label="Nome" placeholder="Ex.: Cozinha" required />
                <Field name="code" label="Identificador" placeholder="cozinha" required pattern="[a-z0-9][a-z0-9_-]{1,39}" />
                <label className={styles.field}>
                  <span>Uso</span>
                  <select name="kind" defaultValue="production" className={styles.input}><option value="production">Produção</option><option value="expedition">Expedição</option><option value="counter">Balcão / todos os pedidos</option></select>
                </label>
                <button type="submit" className={styles.primary}>Criar local</button>
              </form>
              {config.stations.map((station) => <div className={styles.item} key={station.id}><strong>{station.name}</strong><span className={styles.hint}>{stationKindLabels[station.kind] ?? "Operação"} · {station.active ? "ativo" : "inativo"}</span></div>)}
            </article>
          </div>

          <div className={styles.grid}>
            <article className={styles.list}>
              <h2>Ligar local à impressora</h2>
              <form action={linkStationPrinterAction} className={styles.form}>
                <label className={styles.field}><span>Local</span><select name="stationId" required className={styles.input}><option value="">Selecione</option>{config.stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
                <label className={styles.field}><span>Impressora</span><select name="printerId" required className={styles.input}><option value="">Selecione</option>{config.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></label>
                <input type="hidden" name="priority" value="100" />
                <button type="submit" className={`${styles.primary} ${styles.wide}`}>Conectar local à impressora</button>
              </form>
              {config.stationPrinters.map((link) => <div className={styles.item} key={`${link.station_id}:${link.printer_id}`}><strong>{stationMap.get(link.station_id) ?? "Local"} → {printerMap.get(link.printer_id) ?? "Impressora"}</strong><span className={styles.hint}>{link.copies ? `${link.copies} cópia(s)` : "Usa a quantidade padrão"} · {link.active ? "ativo" : "inativo"}</span></div>)}
            </article>

            <article className={styles.list}>
              <h2>Produtos por local</h2>
              <p className={styles.hint}>Use somente se produtos diferentes precisarem sair em impressoras diferentes.</p>
              <form action={linkProductStationAction} className={styles.form}>
                <label className={styles.field}><span>Produto</span><select name="productId" required className={styles.input}><option value="">Selecione</option>{config.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                <label className={styles.field}><span>Local de produção</span><select name="stationId" required className={styles.input}><option value="">Selecione</option>{config.stations.filter((station) => station.kind === "production").map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
                <button type="submit" className={`${styles.primary} ${styles.wide}`}>Definir destino do produto</button>
              </form>
              <span className={styles.hint}>{linkedProduct.size} produto(s) direcionado(s) · {linkedPrinter.size} vínculo(s) local/impressora.</span>
            </article>
          </div>

          <article className={styles.list}>
            <h2>Fila de impressão</h2>
            <p className={styles.hint}>Pedidos normais não exigem ação. Use esta área apenas quando alguma impressão falhar ou precisar ser reimpressa.</p>
            {monitor.jobs.map((job) => (
              <div key={job.id} className={styles.queueRow}>
                <div>
                  <strong>{job.display_number ? `Pedido #${job.display_number}` : "Impressão avulsa"} · {documentLabels[job.document_type] ?? "Documento"}{job.is_reprint ? " · REIMPRESSÃO" : ""}</strong>
                  <div className={styles.hint}>{stationMap.get(job.station_id ?? "") ?? "Sem local definido"} → {printerMap.get(job.printer_id) ?? "Impressora"} · {jobLabels[job.status] ?? "Em processamento"} · {job.copies} cópia(s)</div>
                  {job.last_error ? <div className={styles.warningText}>Não foi possível concluir esta impressão. Confira a impressora e tente novamente.</div> : null}
                </div>
                <div className={styles.actions}>
                  {job.status === "failed" ? <form action={retryPrintJobAction}><input type="hidden" name="jobId" value={job.id} /><button className={styles.secondary}>Tentar novamente</button></form> : null}
                  {job.status === "pending" || job.status === "failed" ? <form action={cancelPrintJobAction}><input type="hidden" name="jobId" value={job.id} /><button className={styles.danger}>Cancelar</button></form> : null}
                  <form action={reprintJobAction} className={styles.reprintForm}><input type="hidden" name="jobId" value={job.id} /><input name="reason" required minLength={3} maxLength={500} placeholder="Motivo" className={styles.input} /><button className={styles.secondary}>Reimprimir</button></form>
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
  return <span className={styles.status} data-health={health}><span className={styles.statusDot} aria-hidden />{text}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className={styles.empty}><span aria-hidden>○</span><span>{text}</span></div>;
}

function Field({ name, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string }) {
  return <label className={styles.field}><span>{label}</span><input {...props} name={name} className={styles.input} /></label>;
}
