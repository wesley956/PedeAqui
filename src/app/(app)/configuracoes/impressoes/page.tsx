import { AgentTokenCreator } from "@/features/printing/agent-token-creator";
import {
  cancelPrintJobAction, createPrinterAction, createPrintStationAction,
  linkProductStationAction, linkStationPrinterAction, reprintJobAction, retryPrintJobAction,
} from "@/features/printing/actions";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { PrintMonitorService } from "@/server/printing/print-monitor-service";
import { effectivePrintHealth, type PrintHealth } from "@/server/printing/printer-health";

const healthLabels: Record<PrintHealth, string> = { unknown: "Aguardando verificação", online: "Online", offline: "Offline", degraded: "Precisa de atenção" };
const jobLabels: Record<string, string> = { pending: "Aguardando", processing: "Imprimindo", printed: "Impresso", failed: "Não impresso", cancelled: "Cancelado" };
const documentLabels: Record<string, string> = { kitchen: "Cozinha", expedition: "Expedição", counter: "Balcão", receipt: "Recibo", custom: "Personalizado" };
const connectionLabels: Record<string, string> = { network: "Rede", usb: "USB", bluetooth: "Bluetooth", system: "Impressora do computador", cloud_agent: "Computador conectado" };
const stationKindLabels: Record<string, string> = { production: "Produção", expedition: "Expedição", counter: "Balcão" };

export default async function PrintingSettingsPage() {
  const [config, monitor] = await Promise.all([PrintConfigService.snapshot(), PrintMonitorService.current(100)]);
  const stationMap = new Map(config.stations.map((item) => [item.id, item.name]));
  const printerMap = new Map(config.printers.map((item) => [item.id, item.name]));
  const linkedPrinter = new Set(config.stationPrinters.map((item) => `${item.station_id}:${item.printer_id}`));
  const linkedProduct = new Set(config.productStations.map((item) => `${item.product_id}:${item.station_id}`));

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1280 }}>
      <header>
        <p className="muted" style={{ margin: 0 }}>Operação local</p>
        <h1 style={{ margin: "4px 0" }}>Central de impressão</h1>
        <p className="muted" style={{ margin: 0 }}>Configure onde cada pedido deve ser impresso e acompanhe o funcionamento das impressoras da unidade.</p>
      </header>

      <div style={grid2}>
        <article className="card" style={cardStyle}>
          <h2 style={titleStyle}>Computadores de impressão</h2>
          <p className="muted" style={hintStyle}>Adicione os computadores que serão usados para enviar pedidos às impressoras do restaurante.</p>
          <AgentTokenCreator />
          <div style={{ display: "grid", gap: 7 }}>
            {config.agents.map((agent) => {
              const health = effectivePrintHealth(agent.status as PrintHealth, agent.last_seen_at);
              return <Row key={agent.id} title={agent.name} detail={`${healthLabels[health]}${agent.version ? ` · versão ${agent.version}` : ""}`} />;
            })}
            {config.agents.length === 0 ? <Empty text="Nenhum computador de impressão configurado." /> : null}
          </div>
        </article>

        <article className="card" style={cardStyle}>
          <h2 style={titleStyle}>Locais de produção</h2>
          <p className="muted" style={hintStyle}>Separe os pedidos por cozinha, expedição ou balcão conforme a rotina do restaurante.</p>
          <form action={createPrintStationAction} style={formGrid}>
            <Field name="name" label="Nome" placeholder="Ex.: Chapa" required />
            <Field name="code" label="Identificador" placeholder="chapa" required pattern="[a-z0-9][a-z0-9_-]{1,39}" />
            <label style={labelStyle}><span>Uso</span><select name="kind" defaultValue="production" style={inputStyle}><option value="production">Produção</option><option value="expedition">Expedição</option><option value="counter">Balcão</option></select></label>
            <button type="submit" style={primaryButton}>Criar local</button>
          </form>
          <div style={{ display: "grid", gap: 7 }}>{config.stations.map((station) => <Row key={station.id} title={station.name} detail={`${stationKindLabels[station.kind] ?? "Operação"} · ${station.active ? "ativo" : "inativo"}`} />)}{config.stations.length === 0 ? <Empty text="Nenhum local de impressão configurado." /> : null}</div>
        </article>
      </div>

      <article className="card" style={cardStyle}>
        <h2 style={titleStyle}>Impressoras</h2>
        <form action={createPrinterAction} style={{ ...formGrid, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Field name="name" label="Nome" placeholder="Cozinha 80mm" required />
          <label style={labelStyle}><span>Conexão</span><select name="connectionType" defaultValue="network" style={inputStyle}><option value="network">Rede</option><option value="usb">USB (em breve)</option><option value="bluetooth">Bluetooth (em breve)</option><option value="system">Impressora do computador</option><option value="cloud_agent">Computador conectado</option></select></label>
          <Field name="connectionAddress" label="Endereço na rede" placeholder="192.168.1.50" />
          <Field name="connectionPort" label="Porta" type="number" defaultValue="9100" min={1} max={65535} />
          <label style={labelStyle}><span>Papel</span><select name="paperWidthMm" defaultValue="80" style={inputStyle}><option value="80">80 mm</option><option value="58">58 mm</option></select></label>
          <Field name="defaultCopies" label="Cópias" type="number" defaultValue="1" min={1} max={10} />
          <label style={labelStyle}><span>Computador</span><select name="agentId" defaultValue="" style={inputStyle}><option value="">Sem vínculo</option>{config.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
          <label style={labelStyle}><span>Impressora alternativa</span><select name="fallbackPrinterId" defaultValue="" style={inputStyle}><option value="">Nenhuma</option>{config.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></label>
          <button type="submit" style={primaryButton}>Adicionar impressora</button>
        </form>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
          {config.printers.map((printer) => {
            const health = effectivePrintHealth(printer.status as PrintHealth, printer.last_seen_at);
            return <div key={printer.id} style={miniCard}><strong>{printer.name}</strong><span className="muted" style={hintStyle}>{healthLabels[health]} · {connectionLabels[printer.connection_type] ?? "Conectada"} · {printer.paper_width_mm} mm · {printer.default_copies} cópia(s)</span>{printer.last_error ? <span style={{ color: "#f97066", fontSize: 12 }}>A impressora informou uma falha. Verifique a conexão e tente novamente.</span> : null}</div>;
          })}
          {config.printers.length === 0 ? <Empty text="Nenhuma impressora configurada." /> : null}
        </div>
      </article>

      <div style={grid2}>
        <article className="card" style={cardStyle}>
          <h2 style={titleStyle}>Onde imprimir</h2>
          <form action={linkStationPrinterAction} style={formGrid}>
            <label style={labelStyle}><span>Local</span><select name="stationId" required style={inputStyle}><option value="">Selecione</option>{config.stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
            <label style={labelStyle}><span>Impressora</span><select name="printerId" required style={inputStyle}><option value="">Selecione</option>{config.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></label>
            <Field name="priority" label="Ordem" type="number" defaultValue="100" min={0} max={10000} />
            <Field name="copies" label="Cópias (opcional)" type="number" min={1} max={10} />
            <button type="submit" style={primaryButton}>Vincular</button>
          </form>
          <div style={{ display: "grid", gap: 6 }}>{config.stationPrinters.map((link) => <Row key={`${link.station_id}:${link.printer_id}`} title={`${stationMap.get(link.station_id) ?? "Local"} → ${printerMap.get(link.printer_id) ?? "Impressora"}`} detail={`ordem ${link.priority}${link.copies ? ` · ${link.copies} cópia(s)` : ""}`} />)}</div>
        </article>

        <article className="card" style={cardStyle}>
          <h2 style={titleStyle}>Produtos por local</h2>
          <form action={linkProductStationAction} style={formGrid}>
            <label style={labelStyle}><span>Produto</span><select name="productId" required style={inputStyle}><option value="">Selecione</option>{config.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label style={labelStyle}><span>Local de produção</span><select name="stationId" required style={inputStyle}><option value="">Selecione</option>{config.stations.filter((s) => s.kind === "production").map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
            <button type="submit" style={primaryButton}>Definir destino</button>
          </form>
          <div className="muted" style={hintStyle}>Escolha onde cada produto deve ser impresso para a equipe de produção.</div>
          <div style={{ fontSize: 12 }}>{linkedProduct.size} produto(s) direcionado(s) · {linkedPrinter.size} local(is) ligado(s) a impressoras.</div>
        </article>
      </div>

      <article className="card" style={cardStyle}>
        <div><h2 style={titleStyle}>Fila de impressão</h2><p className="muted" style={hintStyle}>Acompanhe o que está aguardando, imprimindo ou precisa ser reenviado.</p></div>
        <div style={{ display: "grid", gap: 8 }}>
          {monitor.jobs.map((job) => (
            <div key={job.id} style={{ ...miniCard, gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <strong>{job.display_number ? `Pedido #${job.display_number}` : "Impressão avulsa"} · {documentLabels[job.document_type] ?? "Documento"}{job.is_reprint ? " · REIMPRESSÃO" : ""}</strong>
                <div className="muted" style={hintStyle}>{stationMap.get(job.station_id ?? "") ?? "Sem local definido"} → {printerMap.get(job.printer_id) ?? "Impressora"} · {jobLabels[job.status] ?? "Em processamento"} · tentativa {job.attempts}/{job.max_attempts} · {job.copies} cópia(s)</div>
                {job.last_error ? <div style={{ color: "#f97066", fontSize: 12, marginTop: 3 }}>Não foi possível concluir esta impressão. Verifique a impressora e tente novamente.</div> : null}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "end" }}>
                {job.status === "failed" ? <form action={retryPrintJobAction}><input type="hidden" name="jobId" value={job.id} /><button style={secondaryButton}>Tentar novamente</button></form> : null}
                {job.status === "pending" || job.status === "failed" ? <form action={cancelPrintJobAction}><input type="hidden" name="jobId" value={job.id} /><button style={dangerButton}>Cancelar</button></form> : null}
                <form action={reprintJobAction} style={{ display: "flex", gap: 5 }}><input type="hidden" name="jobId" value={job.id} /><input name="reason" required minLength={3} maxLength={500} placeholder="Motivo" style={{ ...inputStyle, minWidth: 130 }} /><button style={secondaryButton}>Reimprimir</button></form>
              </div>
            </div>
          ))}
          {monitor.jobs.length === 0 ? <Empty text="Nenhuma impressão na fila." /> : null}
        </div>
      </article>
    </section>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label style={labelStyle}><span>{label}</span><input {...input} style={inputStyle} /></label>; }
function Row({ title, detail }: { title: string; detail: string }) { return <div style={miniCard}><strong>{title}</strong><span className="muted" style={hintStyle}>{detail}</span></div>; }
function Empty({ text }: { text: string }) { return <div className="muted" style={{ ...miniCard, fontSize: 13 }}>{text}</div>; }
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 };
const cardStyle: React.CSSProperties = { padding: 18, display: "grid", gap: 14 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 18 };
const hintStyle: React.CSSProperties = { margin: 0, fontSize: 12 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "end" };
const labelStyle: React.CSSProperties = { display: "grid", gap: 5, fontSize: 12, fontWeight: 800 };
const inputStyle: React.CSSProperties = { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "8px 10px" };
const miniCard: React.CSSProperties = { padding: 11, border: "1px solid var(--border)", borderRadius: 12, display: "grid", gap: 4 };
const primaryButton: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850 };
const secondaryButton: React.CSSProperties = { ...primaryButton, background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border)" };
const dangerButton: React.CSSProperties = { ...primaryButton, background: "#b42318" };
