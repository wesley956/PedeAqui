import Link from "next/link";
import {
  linkStationPrinterAction,
  saveOrderPrintPreferencesAction,
  updatePrinterCopiesAction,
} from "@/features/printing/actions";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { PrintLineSpacingService } from "@/server/printing/print-line-spacing-service";
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
      category_id: "11111111-1111-4111-8111-111111111111",
      category_name: "Salgados",
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
      category_id: "22222222-2222-4222-8222-222222222222",
      category_name: "Bebidas",
      name: "Refrigerante 2L",
      quantity: 1,
      line_total_cents: 2000,
      modifiers: [],
    },
  ],
};

const previewFontSize = {
  normal: 12,
  large: 15,
  extra_large: 18,
} as const;

const previewLineHeight = {
  compact: 1.05,
  normal: 1.25,
  comfortable: 1.45,
  wide: 1.7,
} as const;

export default async function PrintFormatPage() {
  const [config, access, lineSpacing] = await Promise.all([
    PrintConfigService.snapshot(),
    NavigationAccessService.load(),
    PrintLineSpacingService.get(),
  ]);
  const canManage = access.permissionKeys.includes(PERMISSIONS.PRINTING_MANAGE);
  const preferences = config.printPreferences;
  const stationMap = new Map(config.stations.map((station) => [station.id, station.name]));
  const printerMap = new Map(config.printers.map((printer) => [printer.id, printer.name]));
  const previewPreferences = preferences.item_layout === "sections" && preferences.drink_category_ids.length > 0
    ? { ...preferences, drink_category_ids: ["22222222-2222-4222-8222-222222222222"] }
    : preferences;
  const preview = renderPrintDocument(samplePayload, "receipt", 80, false, previewPreferences);
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
      {!canManage ? <div className={styles.notice}>Seu acesso permite visualizar esta configuração, mas somente quem administra impressão pode alterá-la.</div> : null}

      <div className={styles.grid}>
        <div className={styles.stack}>
          <article className={`card ${styles.card}`}>
            <div className={styles.sectionHead}>
              <h2>O que aparece no papel</h2>
              <p className={styles.hint}>Número do pedido, horário, origem e itens continuam sendo a base do comprovante. Você escolhe os detalhes adicionais.</p>
            </div>
            <form action={saveOrderPrintPreferencesAction} className={styles.stack}>
              <label className={styles.field}>
                <span>Tamanho das letras</span>
                <select className={styles.input} name="textSize" defaultValue={preferences.text_size} disabled={!canManage}>
                  <option value="normal">Padrão</option>
                  <option value="large">Grande — mais fácil de enxergar</option>
                  <option value="extra_large">Extra grande — máxima legibilidade</option>
                </select>
                <small className={styles.hint}>Use Grande ou Extra grande quando alguém da equipe tiver dificuldade para enxergar o comprovante. O padrão atual não muda sozinho.</small>
              </label>
              <label className={styles.field}>
                <span>Espaçamento entre linhas</span>
                <select className={styles.input} name="lineSpacing" defaultValue={lineSpacing} disabled={!canManage}>
                  <option value="compact">Compacto — economiza papel</option>
                  <option value="normal">Padrão</option>
                  <option value="comfortable">Confortável — leitura mais arejada</option>
                  <option value="wide">Amplo — máximo espaçamento</option>
                </select>
                <small className={styles.hint}>Controla somente a distância vertical entre as linhas. Os níveis Confortável e Amplo agora têm uma diferença mais visível no papel.</small>
              </label>
              <label className={styles.field}>
                <span>Organização dos itens</span>
                <select className={styles.input} name="itemLayout" defaultValue={preferences.item_layout} disabled={!canManage}>
                  <option value="continuous">Lista contínua</option>
                  <option value="sections">Separar pedido e bebidas</option>
                </select>
                <small className={styles.hint}>Adicionais e observações continuam logo abaixo do produto ao qual pertencem.</small>
              </label>
              <label className={styles.field}>
                <span>Título da parte principal</span>
                <input className={styles.input} name="orderSectionTitle" maxLength={40} defaultValue={preferences.order_section_title} disabled={!canManage} />
              </label>
              <label className={styles.field}>
                <span>Título da parte de bebidas</span>
                <input className={styles.input} name="drinksSectionTitle" maxLength={40} defaultValue={preferences.drinks_section_title} disabled={!canManage} />
              </label>
              <fieldset className={styles.field}>
                <legend>Categorias que são bebidas</legend>
                <small className={styles.hint}>Marque as categorias que devem sair na parte de bebidas.</small>
                <div className={styles.options}>
                  {config.categories.map((category) => (
                    <PrintOption key={category.id} name="drinkCategoryIds" title={category.name} hint="Imprimir em Bebidas" checked={preferences.drink_category_ids.includes(category.id)} value={category.id} disabled={!canManage} />
                  ))}
                </div>
              </fieldset>
              <div className={styles.options}>
                <PrintOption name="showCustomerName" title="Nome do cliente" hint="Mostra quem fez o pedido." checked={preferences.show_customer_name} disabled={!canManage} />
                <PrintOption name="showCustomerPhone" title="Telefone nas entregas" hint="Útil para contato do entregador." checked={preferences.show_customer_phone} disabled={!canManage} />
                <PrintOption name="showDeliveryAddress" title="Endereço de entrega" hint="Rua, número, bairro e referência." checked={preferences.show_delivery_address} disabled={!canManage} />
                <PrintOption name="showItemModifiers" title="Sabores e adicionais" hint="Mostra complementos e escolhas do item." checked={preferences.show_item_modifiers} disabled={!canManage} />
                <PrintOption name="showItemNotes" title="Observações dos itens" hint="Ex.: sem cebola, caprichar no molho." checked={preferences.show_item_notes} disabled={!canManage} />
                <PrintOption name="showPrices" title="Preços e total" hint="Na cozinha os preços continuam ocultos." checked={preferences.show_prices} disabled={!canManage} />
                <PrintOption name="showPayment" title="Forma de pagamento" hint="Mostra como o cliente vai pagar." checked={preferences.show_payment} disabled={!canManage} />
                <PrintOption name="showFooter" title="Mensagem no rodapé" hint="Adiciona uma mensagem personalizada ao final." checked={preferences.show_footer} disabled={!canManage} />
              </div>
              <label className={styles.field}>
                <span>Mensagem do rodapé</span>
                <input className={styles.input} name="footerText" maxLength={120} defaultValue={preferences.footer_text ?? ""} placeholder="Ex.: Obrigado pela preferência!" disabled={!canManage} />
              </label>
              {canManage ? <button className={styles.primary} type="submit">Salvar formato de impressão</button> : null}
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
                  {canManage ? (
                    <form action={updatePrinterCopiesAction} className={styles.copiesForm}>
                      <input type="hidden" name="printerId" value={printer.id} />
                      <label className={styles.copiesField}>
                        <span>Vias</span>
                        <input className={styles.input} name="defaultCopies" type="number" min={1} max={10} defaultValue={printer.default_copies} required />
                      </label>
                      <button className={styles.secondary} type="submit">Salvar</button>
                    </form>
                  ) : <strong>{printer.default_copies} via(s)</strong>}
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
                  {canManage ? (
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
                  ) : <strong>{link.copies ? `${link.copies} via(s)` : "Padrão"}</strong>}
                </div>
              ))}
              {config.stationPrinters.length === 0 ? <div className={styles.empty}>Ainda não há locais ligados a impressoras. Faça a conexão em “Configuração avançada”.</div> : null}
            </div>
          </article>
        </div>

        <aside className={`card ${styles.card} ${styles.preview}`}>
          <div className={styles.sectionHead}>
            <h2>Prévia do comprovante</h2>
            <p className={styles.hint}>Exemplo em papel de 80 mm. Depois de salvar, esta prévia reflete o tamanho das letras e o espaçamento entre linhas.</p>
          </div>
          <pre className={styles.paper} style={{ fontSize: previewFontSize[preferences.text_size], lineHeight: previewLineHeight[lineSpacing] }}>{preview}</pre>
        </aside>
      </div>
    </section>
  );
}

function PrintOption({ name, title, hint, checked, value, disabled }: { name: string; title: string; hint: string; checked: boolean; value?: string; disabled?: boolean }) {
  return (
    <label className={styles.option}>
      <input type="checkbox" name={name} value={value} defaultChecked={checked} disabled={disabled} />
      <span className={styles.optionCopy}><strong>{title}</strong><small>{hint}</small></span>
    </label>
  );
}
