import { ThemeSelector } from "@/components/theme/theme-selector";
import type { ModuleKey } from "@/modules/module-catalog";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { SettingsHubClient, type SettingsHubArea, type SettingsHubItem } from "./settings-hub-client";
import styles from "./settings-hub.module.css";
import { PageHeader } from "@/components/ui/page-header";

type SettingDefinition = {
  title: string;
  description: string;
  href: string;
  permissions: readonly string[];
  keywords: readonly string[];
  moduleKey?: ModuleKey;
};

const definitions = {
  store: { title: "Dados da loja", description: "Nome, telefone, e-mail e endereço.", href: "/configuracoes/loja", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["nome", "telefone", "endereco", "cidade", "estado"] },
  catalog: { title: "Aparência do cardápio", description: "Logo, capa, cor, publicação e pedido mínimo.", href: "/configuracoes/cardapio", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["logo", "capa", "cor", "cardapio", "pedido minimo", "aparencia", "publicar"], moduleKey: "catalog" },
  products: { title: "Produtos e disponibilidade", description: "Marcar como esgotado, preços, fotos e cadastro de itens.", href: "/cardapio/produtos", permissions: [PERMISSIONS.PRODUCTS_VIEW], keywords: ["produto", "item", "esgotado", "acabou", "pausar", "desativar", "preco", "foto"], moduleKey: "catalog" },
  modifiers: { title: "Sabores, tamanhos e adicionais", description: "Pausar um sabor que acabou ou montar as escolhas do cliente.", href: "/cardapio/adicionais", permissions: [PERMISSIONS.PRODUCTS_VIEW], keywords: ["sabor", "sabores", "tamanho", "adicional", "complemento", "borda", "acabou", "pausar", "desativar", "esgotado", "opcao"], moduleKey: "catalog" },
  hours: { title: "Horários", description: "Períodos de funcionamento da unidade.", href: "/configuracoes/horarios", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["horario", "abre", "fecha", "funcionamento"] },
  flow: { title: "Fluxo de pedidos", description: "Avançado: escolher etapa por etapa da entrega e da retirada.", href: "/configuracoes/fluxo-pedidos", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["pedido", "fluxo", "producao", "retirada", "prazo"] },
  operation: { title: "Como meu restaurante trabalha", description: "Quem confirma pedidos, etapas da equipe e entrega, em 4 perguntas.", href: "/configuracoes/operacao", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["pratico", "simples", "operacao", "aceite", "equipe", "movimento"] },
  dining: { title: "Salão e mesas", description: "Mesas, capacidade, áreas e QR.", href: "/configuracoes/salao", permissions: [PERMISSIONS.DINING_MANAGE], keywords: ["salao", "mesa", "comanda", "qr"], moduleKey: "dining" },
  cash: { title: "Caixas", description: "Pontos físicos usados nos turnos de caixa.", href: "/configuracoes/caixa", permissions: [PERMISSIONS.CASH_MANAGE], keywords: ["caixa", "pdv", "turno"] , moduleKey: "cash" },
  payments: { title: "Formas de pagamento", description: "Dinheiro, cartões, Pix e opções disponíveis ao cliente.", href: "/configuracoes/pagamentos", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["pix", "cartao", "credito", "debito", "dinheiro", "pagamento", "maquininha"] },
  delivery: { title: "Bairros e taxas de entrega", description: "Bairros, taxas, prazo e frete grátis do checkout.", href: "/configuracoes/entrega", permissions: [PERMISSIONS.STORES_VIEW], keywords: ["bairro", "taxa", "frete", "entrega", "delivery", "prazo", "retirada"] },
  drivers: { title: "Entregadores", description: "Equipe, disponibilidade e acesso mobile.", href: "/configuracoes/entregadores", permissions: [PERMISSIONS.DELIVERY_MANAGE], keywords: ["entregador", "motoboy", "motorista", "pin", "rota"] , moduleKey: "driver" },
  whatsapp: { title: "Conversas e WhatsApp", description: "Conexão, atendimento e mensagens automáticas.", href: "/configuracoes/conversas", permissions: [PERMISSIONS.INTEGRATIONS_MANAGE], keywords: ["whatsapp", "wpp", "mensagem", "conversa", "telefone"] , moduleKey: "conversations" },
  integrations: { title: "Canais externos", description: "Conecte iFood e acompanhe integrações sem alterar seus módulos.", href: "/configuracoes/integracoes", permissions: [PERMISSIONS.INTEGRATIONS_VIEW], keywords: ["ifood", "integracao", "marketplace", "canal", "pedidos externos"] },
  printing: { title: "Conectar e acompanhar impressoras", description: "Aplicativo de impressão, impressoras, locais e fila de impressão.", href: "/configuracoes/impressoes", permissions: [PERMISSIONS.PRINTING_VIEW], keywords: ["impressora", "imprimir", "impressao", "aplicativo de impressao", "cozinha", "conectar", "offline", "fila"] },
  printFormat: { title: "Formato e vias", description: "Quantidade de cópias e o que aparece no comprovante.", href: "/configuracoes/impressoes/formato", permissions: [PERMISSIONS.PRINTING_VIEW], keywords: ["vias", "via", "copias", "copia", "quantidade", "papel", "comprovante", "cupom", "recibo", "conteudo", "impressao", "imprimir", "cliente", "telefone", "endereco", "preco", "total", "pagamento", "rodape"] },
} satisfies Record<string, SettingDefinition>;

export default async function SettingsPage() {
  const access = await NavigationAccessService.load();
  const granted = new Set(access.permissionKeys);
  const canManageResources = granted.has(PERMISSIONS.STORES_MANAGE);

  const resolve = (definition: SettingDefinition): SettingsHubItem | null => {
    if (!definition.permissions.some((permission) => granted.has(permission))) return null;
    const available = definition.moduleKey ? access.moduleAvailability[definition.moduleKey].available : true;
    return {
      title: definition.title,
      description: definition.description,
      href: definition.href,
      available,
      activationHref: definition.moduleKey ? `/configuracoes/modulos?module=${definition.moduleKey}&target=on` : null,
      keywords: [...definition.keywords],
    };
  };

  const teamItems: SettingsHubItem[] = access.items
    .filter((item) => item.key === "team" || item.key === "scale")
    .map((item) => ({ title: item.label, description: item.key === "team" ? "Funcionários, funções e permissões." : "Plano contratado, várias unidades e marca própria.", href: item.href, available: true, activationHref: null, keywords: item.key === "team" ? ["equipe", "funcionario", "usuario", "permissao", "acesso"] : ["plano", "unidades", "filial", "expansao", "marca propria", "dominio", "escala"] }));

  const areas: SettingsHubArea[] = [
    { key: "menu", icon: "catalog", title: "Cardápio", description: "O que está à venda hoje e como o cliente escolhe.", items: [resolve(definitions.products), resolve(definitions.modifiers), resolve(definitions.catalog)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "store", icon: "store", title: "Minha loja", description: "Identidade, dados e funcionamento do estabelecimento.", items: [resolve(definitions.store), resolve(definitions.hours)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "orders", icon: "orders", title: "Pedidos e atendimento", description: "Como os pedidos entram, avançam e são atendidos.", items: [resolve(definitions.operation), resolve(definitions.flow), resolve(definitions.dining), resolve(definitions.cash)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "payments", icon: "payments", title: "Pagamentos", description: "Defina como seus clientes podem pagar.", items: [resolve(definitions.payments)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "delivery", icon: "deliveries", title: "Entrega e retirada", description: "Bairros, taxas, prazo e equipe de entrega.", items: [resolve(definitions.delivery), resolve(definitions.drivers)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "whatsapp", icon: "conversations", title: "WhatsApp", description: "Conexão, atendimento e mensagens da unidade.", items: [resolve(definitions.whatsapp)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "integrations", icon: "integrations", title: "Integrações", description: "Canais de venda externos e conexões da unidade.", items: [resolve(definitions.integrations)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "printing", icon: "printing", title: "Impressão automática", description: "Conexão, vias, conteúdo e acompanhamento da impressão.", items: [resolve(definitions.printing), resolve(definitions.printFormat)].filter((item): item is SettingsHubItem => Boolean(item)) },
    { key: "team", icon: "team", title: "Equipe e plano", description: "Pessoas, funções, permissões, plano e unidades.", items: teamItems },
  ].filter((area) => area.items.length > 0);

  return <section className={styles.root}>
    <PageHeader title="Configure seu negócio" description="Procure pelo que você quer fazer. O PedeAqui cuida de onde essa configuração fica." status={<span className={styles.badge}>Modo simples</span>} />

    <SettingsHubClient areas={areas} canManageResources={canManageResources} />

    <section className={styles.appearance} aria-labelledby="settings-appearance-title">
      <div className={styles.sectionHeader}><h2 id="settings-appearance-title">Aparência</h2><p>Escolha como o PedeAqui aparece neste dispositivo.</p></div>
      <ThemeSelector />
    </section>
  </section>;
}
