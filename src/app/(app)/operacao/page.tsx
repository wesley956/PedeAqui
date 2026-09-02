import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pauseOrdersAction, resumeOrdersAction } from "@/features/menu/actions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { OperationalDayService } from "@/server/operations/operational-day-service";
import styles from "./operacao.module.css";

type Check = { label: string; detail: string; ready: boolean; href: string };

export default async function OperationDayPage() {
  const access = await NavigationAccessService.load();
  const day = await OperationalDayService.load(access);
  const checks: Check[] = [
    { label: "Dados da unidade", detail: "Nome, telefone e endereço para atender o cliente.", ready: day.readiness.storeProfileComplete, href: "/configuracoes/loja" },
    { label: "Cardápio publicado", detail: "Pelo menos um produto ativo e cardápio disponível.", ready: day.readiness.productCount > 0 && day.menu.active, href: "/cardapio/produtos" },
    { label: "Horários", detail: "Faixas de funcionamento configuradas.", ready: day.readiness.hoursCount > 0, href: "/configuracoes/horarios" },
    { label: "Formas de pagamento", detail: "O cliente sabe como poderá pagar.", ready: day.readiness.paymentMethodCount > 0, href: "/configuracoes/pagamentos" },
    ...(day.modules.delivery ? [{ label: "Entrega", detail: "Configuração do módulo de entrega pronta.", ready: day.readiness.deliveryConfigured, href: "/configuracoes/entrega" }] : []),
    ...(day.health.printingConfigured ? [{ label: "Impressão", detail: day.pending.printing ? `${day.pending.printing} problema(s) exigem atenção.` : "Agente e filas sem falhas detectadas.", ready: day.pending.printing === 0, href: "/configuracoes/impressoes" }] : []),
  ];
  const blockers = checks.filter((check) => !check.ready);
  const accepting = day.menu.accepting_orders;
  return <section className={styles.page}>
    <header className={styles.hero} data-accepting={accepting}>
      <div><p className={styles.eyebrow}>OPERAÇÃO DO DIA</p><h1>{accepting ? "Restaurante recebendo pedidos" : "Recebimento pausado"}</h1><p>{accepting ? "Pedidos novos podem entrar. Acompanhe as pendências antes do movimento." : `${day.menu.pause_reason ?? "Pausa operacional"}. Os pedidos já recebidos continuam normalmente.`}</p></div>
      {accepting ? <form action={pauseOrdersAction}><input type="hidden" name="reason" value="Encerramento ou pausa pela central da operação" /><Button tone="secondary" type="submit">Pausar recebimento</Button></form> : <form action={resumeOrdersAction}><Button type="submit">Retomar em 1 clique</Button></form>}
    </header>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><span>ANTES DE ABRIR</span><h2>Seu restaurante está pronto?</h2></div><strong>{checks.length - blockers.length}/{checks.length}</strong></div>
      <div className={styles.checks}>{checks.map((check) => <article key={check.label} data-ready={check.ready}><span aria-hidden>{check.ready ? "✓" : "!"}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div><Link href={check.href}>{check.ready ? "Revisar" : "Resolver"}</Link></article>)}</div>
      {!accepting ? <div className={styles.openAction}><div><strong>{blockers.length ? `${blockers.length} ponto(s) merecem atenção` : "Tudo pronto para abrir"}</strong><p>Pendências permanecem visíveis; retomar não altera horários nem pedidos existentes.</p></div><form action={resumeOrdersAction}><Button type="submit">Abrir recebimento</Button></form></div> : null}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><span>ANTES DE ENCERRAR</span><h2>Nada fica esquecido</h2></div></div>
      <div className={styles.pendingGrid}>
        <Pending label="Pedidos em andamento" count={day.pending.orders} href="/pedidos" />
        {day.pending.cashSessions !== null ? <Pending label="Caixas ainda abertos" count={day.pending.cashSessions} href="/caixa" /> : null}
        {day.pending.conversations !== null ? <Pending label="Conversas humanas" count={day.pending.conversations} href="/conversas" /> : null}
        {day.health.printingConfigured ? <Pending label="Falhas de impressão" count={day.pending.printing} href="/configuracoes/impressoes" /> : null}
        <Pending label="Alertas de pagamento" count={day.pending.payments} href="/configuracoes/pagamentos" />
      </div>
      <div className={styles.closeGuide}>
        <div><strong>Escolha até onde quer fechar hoje</strong><p>O PedeAqui nunca concluirá pedidos, entregas, conversas ou caixa automaticamente.</p></div>
        <ol><li><strong>Recebimento:</strong> pause novos pedidos.</li><li><strong>Operação:</strong> resolva pedidos e conversas.</li>{day.modules.cash ? <li><strong>Operação + caixa:</strong> confira e feche cada caixa.</li> : null}<li><strong>Completo:</strong> revise também impressão e pagamentos.</li></ol>
        {accepting ? <form action={pauseOrdersAction}><input type="hidden" name="reason" value="Encerramento do dia" /><Button tone="secondary" type="submit">Encerrar recebimento</Button></form> : <strong className={styles.closed}>Recebimento já encerrado ✓</strong>}
      </div>
    </section>
  </section>;
}

function Pending({ label, count, href }: { label: string; count: number; href: string }) {
  return <article className={styles.pending} data-clear={count === 0}><span>{count}</span><div><strong>{label}</strong><Link href={href}>{count ? "Resolver agora" : "Revisar"}</Link></div></article>;
}
