import Link from "next/link";
import { normalizeAppUrl } from "@/lib/app-url";
import { PlatformCommercialOnboardingService } from "@/server/platform/platform-commercial-onboarding-service";
import styles from "../platform.module.css";

export const dynamic = "force-dynamic";

const commercialAnswers = [
  ["Quanto custa?", "Os três primeiros clientes entram no Plano Fundadores por R$ 79,90 por mês, com esse valor preservado enquanto mantiverem o mesmo contrato."],
  ["Preciso usar tudo?", "Não. Ligamos apenas as ferramentas que fazem sentido para o negócio; módulos desligados somem do menu sem apagar histórico."],
  ["E se eu quiser outra ferramenta depois?", "O plano pode ser ampliado por módulos. A mudança gera uma nova condição comercial, sem alterar silenciosamente o contrato antigo."],
  ["O WhatsApp é obrigatório?", "Não. Cardápio, checkout e operação funcionam sem o WhatsApp. Quando o número estiver pronto, conectamos o menu automático e o acompanhamento."],
  ["Meus dados somem se atrasar?", "Não. Uma suspensão bloqueia o acesso, mas preserva cardápio, pedidos, clientes e configurações para reativação."],
] as const;

export default async function PresentationPage() {
  const demo = await PlatformCommercialOnboardingService.ensureDemo();
  const baseUrl = normalizeAppUrl(process.env.APP_URL, "https://www.pedeaqui.pp.ua");
  const menuUrl = `${baseUrl}/m/${demo.slug}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(menuUrl)}`;

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>MODO APRESENTAÇÃO</p><h1>Roteiro seguro da demonstração</h1><p>Siga esta ordem no celular ou no computador do cliente. A demonstração é separada dos restaurantes reais.</p></div>
      <span className={styles.pill} data-tone="good">Demonstração preparada</span>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Comece por aqui</h2><p>Deixe esta página aberta como sua cola. Cada etapa tem um caminho direto.</p></div></div>
      <div className={styles.readinessGrid}>
        <Step number="1" title="Cardápio do cliente" text="Mostre busca, categorias, produtos e visual no celular."><Link className={styles.button} href={menuUrl} target="_blank">Abrir cardápio demo</Link></Step>
        <Step number="2" title="Pedido completo" text="Adicione um produto, escolha retirada e avance até a confirmação." />
        <Step number="3" title="Operação" text="Mostre pedidos, produção e acompanhamento usando somente módulos ativos."><Link className={styles.button} href="/dashboard">Abrir restaurante atual</Link></Step>
        <Step number="4" title="Painel do Proprietário" text="Mostre clientes, módulos, mensalidades e Plano Fundadores."><Link className={styles.button} href="/platform/assinaturas">Abrir financeiro SaaS</Link></Step>
        <Step number="5" title="WhatsApp" text="Explique o menu 1 Cardápio, 2 Acompanhar pedido e 3 Falar com atendente. Se estiver desconectado, use a contingência abaixo." />
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>QR Code e endereço curto</h2><p>O QR contém somente o endereço público do cardápio demonstrativo, sem credenciais.</p></div></div>
      <div className={styles.operationGrid}>
        <div className={styles.operationPanel}>{/* eslint-disable-next-line @next/next/no-img-element -- QR is a tiny remote-generated public URL, not catalog media. */}<img src={qrUrl} width="260" height="260" alt="QR Code do cardápio demonstrativo" /></div>
        <div className={styles.operationPanel}><strong>Endereço para compartilhar</strong><p className={styles.meta} style={{ overflowWrap: "anywhere" }}>{menuUrl}</p><Link className={styles.button} href={menuUrl} target="_blank">Testar endereço agora</Link><p className={styles.advancedNote}>Se o QR externo não carregar, mostre ou envie este endereço. O cardápio continua independente do gerador do QR.</p></div>
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Plano alternativo</h2><p>Não improvise caso a internet ou o WhatsApp falhe.</p></div></div>
      <div className={styles.supportGrid}>
        <Info title="Internet instável" text="Use o 4G do celular, mantenha as abas já abertas e não atualize formulários com dados preenchidos. O sistema avisa quando ficar offline." />
        <Info title="WhatsApp desconectado" text="Mostre o cardápio e o acompanhamento pelo navegador. Explique que pedidos continuam operando e que o canal pode ser conectado depois." />
        <Info title="Computador indisponível" text="Faça cardápio, checkout, acompanhamento e visão responsiva pelo celular. Use o computador do cliente apenas para a visão operacional ampla." />
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Respostas comerciais</h2><p>Respostas curtas para manter a conversa clara.</p></div></div>
      <div className={styles.featureList}>{commercialAnswers.map(([question, answer]) => <div className={styles.featureRow} key={question}><span><strong>{question}</strong><small>{answer}</small></span></div>)}</div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Checklist antes de sair</h2><p>Execute os cinco itens na ordem.</p></div></div>
      <ol style={{ display: "grid", gap: 10, paddingLeft: 22 }}><li>Abrir esta página e o cardápio demo no celular.</li><li>Fazer um pedido de teste e guardar o código de acompanhamento.</li><li>Confirmar que o computador do cliente abre o endereço do PedeAqui.</li><li>Conferir Plano Fundadores, módulos e financeiro no Painel do Proprietário.</li><li>Levar carregador e deixar o 4G disponível como contingência.</li></ol>
    </section>
  </div>;
}

function Step({ number, title, text, children }: { number: string; title: string; text: string; children?: React.ReactNode }) {
  return <article className={styles.supportCard}><span className={styles.pill}>{number}</span><strong>{title}</strong><span>{text}</span>{children}</article>;
}

function Info({ title, text }: { title: string; text: string }) {
  return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>;
}
