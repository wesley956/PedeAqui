import Link from "next/link";
import {
  linkStationPrinterAction,
  saveOrderPrintPreferencesAction,
  updatePrinterCopiesAction,
} from "@/features/printing/actions";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { renderPrintDocument } from "@/server/printing/templates";
import styles from "./format.module.css";

const samplePayload = {
  order: {
    id: "preview-order",
    display_number: 128,
    channel: "CARDAPIO",
    fulfillment_type: "delivery",
    customer_name: "Maria Silva",
    customer_phone: "(19) 99999-9999",
    address: {
      street: "Rua das Flores",
      number: "123",
      complement: "Casa 2",
      district: "Jardim Alvorada",
      city: "Nova Odessa",
      state: "SP",
      reference: "Portão branco",
    },
    subtotal_cents: 4200,
    discount_cents: 0,
    delivery_fee_cents: 500,
    total_cents: 4700,
    payment_method: "Dinheiro",
    cash_change_for_cents: null,
    created_at: "2026-08-29T18:30:00-03:00",
    confirmed_at: "2026-08-29T18:31:00-03:00",
    scheduled_for: null,
    timezone: "America/Sao_Paulo",
  },
  station: { id: "preview-station", name: "Balcão", code: "pedidos", kind: "counter" },
  items: [
    {
      order_item_id: "preview-item-1",
      product_id: "preview-product-1",
      name: "Copo 30 salgados",
      quantity: 1,
      note: "Caprichar no guardanapo",
      line_total_cents: 2200,
      modifiers: [
        { group: "Sabores", name: "Coxinha", quantity: 15 },
        { group: "Sabores", name: "Bolinha de queijo", quantity: 15 },
      ],
    },
    {
      order_item_id: "preview-item-2",
      product_id: "preview-product-2",
      name: "Refrigerante 2L",
      quantity: 1,
      line_total_cents: 2000,
      modifiers: [],
    },
  ],
};

export default async function PrintFormatPage() {
  const config = await PrintConfigService.snapshot();
  const preferences = config.printPreferences;
  const stationMap = new Map(config.stations.map((station) => [station.id, station.name]));
  const printerMap = new Map(config.printers.map((printer) => [printer.id, printer.name]));
  const preview = renderPrintDocument(samplePayload, "receipt", 80, false, preferences);
  const activePrinters = config.printers.filter((printer) => printer.active);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.hint}>CONFIGURAÇÕES · IMPRESSÃO</p>
          <h1>Formato e vias</h1>
          <p className={styles.hint}>Escolha quantas vias cada impressora tira e quais informações aparecem nos comprovantes operacionais do pedido.</p>
        </div>
        <Link href="/configuracoes/impressoes" className={styles.back}>← Conexão e impressoras</Link>
      </header>

      <div className={styles.notice}>
        Documentos fiscais continuam usando o formato fiscal obrigatório. As opções abaixo valem para pedidos, balcão, expedição e produção.
      </div>

      <div className={styles.grid}>
        <div className={styles.stack}>
          <article className={`card ${styles.card}`}>
            <div className={styles.sectionHead}>
              <h2>O que aparece no papel</h2>
              <p className={styles.hint}>Número do pedido, horário, origem e itens continuam sendo a base do comprovante. Você escolhe os detalhes adicionais.</p>
            </div>
            <form action={saveOrderPrintPreferencesAction} className={styles.stack}>
              <div className={styles.options}>
                <PrintOption name="showCustomerName" title="Nome do cliente" hint="Mostra quem fez o pedido." checked={preferences.show_customer_name} />
                <PrintOption name="showCustomerPhone" title="Telefone nas entregas" hint="Útil para contato do entregador." checked={preferences.show_customer_phone} />
                <PrintOption name="showDeliveryAddress" title="Endereço de entrega" hint="Rua, número, bairro e referência." checked={preferences.show_delivery_address} />
                <PrintOption name="showItemModifiers" title="Sabores e adicionais" hint="Mostra complementos e escolhas do item." checked={preferences.show_item_modifiers} />
                <PrintOption name="showItemNotes" title="Observações dos itens" hint="Ex.: sem cebola, caprichar no molho." checked={preferences.show_item_notes} />
                <PrintOption name="showPrices" title="Preços e total" hint="Na cozinha os preços continuam ocultos." checked={preferences.show_prices} />
                <PrintOption name="showPayment" title="Forma de pagamento" hint="Mostra como o cliente vai pagar." checked={preferences.show_payment} />
                <PrintOption name="showFooter" title="Mensagem no rodapé" hint="Adiciona uma mensagem personalizada ao final." checked={preferences.show_footer} />
              </div>
              <label className={styles.field}>
                <span>Mensagem do rodapé</span>
                <input className={styles.input} name="footerText" maxLength={120} defaultValue={preferences.footer_text ?? ""} placeholder="Ex.: Obrigado pela preferência!" />
              </label>
              <button className={styles.primary} type="submit">Salvar formato de impressão</button>
            </form>
          </article>

          <article className={`card ${styles.card}`}>
            <div className={styles.sectionHead}>
              <h2>Vias por impressora</h2>
              <p className={styles.hint}>Esta é a quantidade padrão. Você pode sobrescrever a quantidade em um local específico logo abaixo.</p>
            </div>
            <div className={styles.list}>
              {activePrinters.map((printer) => (
                <div className={styles.row} key={printer.id}>
                  <div className={styles.identity}>
                    <strong>{printer.name}</strong>
                    <span className={styles.meta}>{printer.paper_width_mm} mm · padrão atual: {printer.default_copies} via(s)</span>
                  </div>
                  <form action={updatePrinterCopiesAction} className={styles.copiesForm}>
                    <input type="hidden" name="printerId" value={printer.id} />
                    <label className={styles.copiesField}>
                      <span>Vias</span>
                      <input className={styles.input} name="defaultCopies" type="number" min={1} max={10} defaultValue={printer.default_copies} required />
                    </label>
                    <button className={styles.secondary} type="submit">Salvar</button>
                  </form>
                </div>
              ))}
              {activePrinters.length === 0 ? <div className={styles.empty}>Conecte uma impressora primeiro para definir a quantidade de vias.</div> : null}
            </div>
          </article>

          <article className={`card ${styles.card}`}>
            <div className={styles.sectionHead}>
              <h2>Vias por local</h2>
              <p className={styles.hint}>Exemplo: a impressora pode ter padrão de 1 via, mas a Cozinha pode receber 2. Deixe vazio para usar o padrão da impressora.</p>
            </div>
            <div className={styles.list}>
              {config.stationPrinters.map((link) => (
                <div className={styles.row} key={`${link.station_id}:${link.printer_id}`}>
                  <div className={styles.identity}>
                    <strong>{stationMap.get(link.station_id) ?? "Local"} → {printerMap.get(link.printer_id) ?? "Impressora"}</strong>
                    <span className={styles.meta}>{link.copies ? `${link.copies} via(s) neste local` : "Usa o padrão da impressora"}</span>
                  </div>
                  <form action={linkStationPrinterAction} className={styles.copiesForm}>
                    <input type="hidden" name="stationId" value={link.station_id} />
                    <input type="hidden" name="printerId" value={link.printer_id} />
                    <input type="hidden" name="priority" value={link.priority} />
                    <label className={styles.copiesField}>
                      <span>Vias</span>
                      <input className={styles.input} name="copies" type="number" min={1} max={10} defaultValue={link.copies ?? ""} placeholder="Padrão" />
                    </label>
                    <button className={styles.secondary} type="submit">Salvar</button>
                  </form>
                </div>
              ))}
              {config.stationPrinters.length === 0 ? <div className={styles.empty}>Ainda não há locais ligados a impressoras. Faça a conexão em “Configuração avançada”.</div> : null}
            </div>
          </article>
        </div>

        <aside className={`card ${styles.card} ${styles.preview}`}>
          <div className={styles.sectionHead}>
            <h2>Prévia do comprovante</h2>
            <p className={styles.hint}>Exemplo em papel de 80 mm. Depois de salvar, esta prévia reflete as escolhas da loja.</p>
          </div>
          <pre className={styles.paper}>{preview}</pre>
        </aside>
      </div>
    </section>
  );
}

function PrintOption({ name, title, hint, checked }: { name: string; title: string; hint: string; checked: boolean }) {
  return (
    <label className={styles.option}>
      <input type="checkbox" name={name} defaultChecked={checked} />
      <span className={styles.optionCopy}><strong>{title}</strong><small>{hint}</small></span>
    </label>
  );
}
