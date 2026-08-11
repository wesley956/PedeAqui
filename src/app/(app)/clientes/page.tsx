import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAction } from "@/features/customers/actions";
import { CustomerService } from "@/server/customers/customer-service";
import { formatCents } from "@/server/catalog/money";
import styles from "./customers.module.css";

function dateLabel(value: string | null) {
  if (!value) return "Sem compras";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const { customers, search, sort } = await CustomerService.list(params.q, params.sort);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Clientes</h1>
          <p className="muted">Base única da organização para cardápio, PDV e relacionamento.</p>
        </div>
        <div className={styles.countBadge}>{customers.length} cliente(s) nesta visualização</div>
      </header>

      <div className={styles.layout}>
        <form action={createCustomerAction} className={`card ${styles.createCard}`}>
          <div>
            <h2>Novo cliente</h2>
            <p className="muted">Cadastre manualmente sem duplicar a base usada pelos pedidos.</p>
          </div>
          <Input label="Nome" name="name" required minLength={2} />
          <Input label="Telefone" name="phone" type="tel" placeholder="(19) 99999-9999" />
          <Input label="E-mail" name="email" type="email" />
          <Input label="Nascimento" name="birthDate" type="date" />
          <Button type="submit">Cadastrar cliente</Button>
        </form>

        <div className={styles.listArea}>
          <form method="get" className={`card ${styles.filters}`}>
            <Input
              label="Buscar cliente"
              name="q"
              defaultValue={search}
              placeholder="Nome, telefone ou e-mail"
            />
            <label style={{ display: "grid", gap: 5 }}>
              <strong style={{ fontSize: 13 }}>Ordenar por</strong>
              <select name="sort" defaultValue={sort} style={{ minHeight: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" }}>
                <option value="recent">Mais recentes</option>
                <option value="spent">Maior valor gasto</option>
                <option value="orders">Mais pedidos</option>
                <option value="name">Nome A–Z</option>
              </select>
            </label>
            <Button tone="secondary" type="submit">Aplicar</Button>
          </form>

          <div className={`card ${styles.customerList}`}>
            {customers.length === 0 ? (
              <div className={styles.empty}>
                <strong>Nenhum cliente encontrado</strong>
                {search ? "Tente outro nome, telefone ou e-mail." : "Os clientes identificados em pedidos aparecerão aqui."}
              </div>
            ) : customers.map((customer) => (
              <Link href={`/clientes/${customer.id}`} key={customer.id} className={styles.customerRow}>
                <div className={styles.customerIdentity}>
                  <strong className={styles.customerName}>{customer.name}</strong>
                  <div className={styles.contact}>{customer.phone || customer.email || "Sem contato informado"}</div>
                  <div className={styles.openHint}>ABRIR PERFIL →</div>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>PEDIDOS</span>
                  <span className={styles.statValue}>{customer.orders_count}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>TOTAL GASTO</span>
                  <span className={styles.statValue}>{formatCents(Number(customer.total_spent_cents))}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>TICKET MÉDIO</span>
                  <span className={styles.statValue}>{formatCents(customer.average_ticket_cents)}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>ÚLTIMA COMPRA</span>
                  <span className={styles.statValue}>{dateLabel(customer.last_order_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
