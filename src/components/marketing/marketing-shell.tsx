import Link from "next/link";
import type { ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import styles from "./marketing.module.css";

export type MarketingCard = {
  title: string;
  description: string;
  eyebrow?: string;
  href?: string;
};

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.site}>
      <a href="#conteudo-comercial" className={styles.skipLink}>Pular para o conteúdo</a>

      <header className={styles.header}>
        <div className={styles.navWrap}>
          <Link href="/" className={styles.brandLink} aria-label="PedeAqui — início">
            <PedeAquiLogo size="md" surface="light" priority />
          </Link>

          <nav className={styles.desktopNav} aria-label="Navegação comercial">
            <details className={styles.productMenu}>
              <summary>Produto</summary>
              <div className={styles.productMenuPanel}>
                <Link href="/como-funciona">Como funciona</Link>
                <Link href="/pedidos-e-atendimento">Pedidos e atendimento</Link>
                <Link href="/entrega-e-fidelizacao">Entrega e fidelização</Link>
                <Link href="/recursos">Todos os recursos</Link>
              </div>
            </details>
            <Link href="/recursos">Recursos</Link>
            <Link href="/planos">Planos</Link>
          </nav>

          <div className={styles.headerActions}>
            <Link href="/login" className={styles.secondaryButton}>Entrar</Link>
            <Link href="/cadastro" className={styles.primaryButton}>Começar agora</Link>
          </div>
        </div>

        <nav className={styles.mobileNav} aria-label="Navegação comercial mobile">
          <Link href="/login" className={styles.mobileLoginLink}>Entrar</Link>
          <Link href="/como-funciona">Como funciona</Link>
          <Link href="/pedidos-e-atendimento">Pedidos</Link>
          <Link href="/entrega-e-fidelizacao">Entrega</Link>
          <Link href="/recursos">Recursos</Link>
          <Link href="/planos">Planos</Link>
        </nav>
      </header>

      <main id="conteudo-comercial">{children}</main>

      <footer className={styles.footer}>
        <div className={styles.footerGrid}>
          <div>
            <PedeAquiLogo size="md" surface="light" />
            <p>Mais simples para pedir. Mais fácil para organizar a operação.</p>
          </div>
          <nav aria-label="Links do rodapé">
            <Link href="/como-funciona">Como funciona</Link>
            <Link href="/recursos">Recursos</Link>
            <Link href="/planos">Planos</Link>
            <Link href="/login">Entrar</Link>
          </nav>
          <nav aria-label="Informações legais">
            <Link href="/empresa">Informações legais</Link>
            <Link href="/politica-de-privacidade">Privacidade</Link>
            <Link href="/termos-de-uso">Termos de uso</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function MarketingHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.contentWidth}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p className={styles.heroLead}>{description}</p>
        {children}
      </div>
    </section>
  );
}

export function MarketingSection({
  eyebrow,
  title,
  intro,
  children,
  tone = "white",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
  tone?: "white" | "soft" | "dark" | "orange";
}) {
  return (
    <section className={styles.section} data-tone={tone}>
      <div className={styles.contentWidth}>
        <div className={styles.sectionHeading}>
          {eyebrow ? <span className={styles.sectionEyebrow}>{eyebrow}</span> : null}
          <h2>{title}</h2>
          {intro ? <p>{intro}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export function MarketingCards({ cards }: { cards: MarketingCard[] }) {
  return (
    <div className={styles.cardGrid}>
      {cards.map((card) => {
        const content = (
          <>
            {card.eyebrow ? <span>{card.eyebrow}</span> : null}
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            {card.href ? <strong>Entenda melhor →</strong> : null}
          </>
        );
        return card.href ? (
          <Link key={card.title} href={card.href} className={styles.infoCard}>{content}</Link>
        ) : (
          <article key={card.title} className={styles.infoCard}>{content}</article>
        );
      })}
    </div>
  );
}

export function FlowSteps({ steps }: { steps: Array<{ title: string; description: string }> }) {
  return (
    <ol className={styles.flowGrid}>
      {steps.map((step, index) => (
        <li key={step.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

export function CommercialCta({ title, description }: { title: string; description: string }) {
  return (
    <section className={styles.ctaSection}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.ctaActions}>
        <Link href="/cadastro" className={styles.darkButton}>Criar minha conta</Link>
        <Link href="/login" className={styles.lightButton}>Já uso o PedeAqui</Link>
      </div>
    </section>
  );
}

export { styles as marketingStyles };
