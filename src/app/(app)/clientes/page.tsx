import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAction } from "@/features/customers/actions";
import { CustomerService } from "@/server/customers/customer-service";
import { formatCents } from "@/server/catalog/money";
import styles from "./customers-list-v3.module.css";

function dateLabel(value: string | null) {
  if (!value) return "Sem compras";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const params = await searchParams;
  const { customers, search, sort } = await CustomerService.list(params.q, params.sort);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className="muted">CLIENTES E HISTÓRICO</p>
          <h1>Clientes</h1>
          <p className="muted">Encontre quem já comprou, veja o histórico e acesse os dados que ajudam no próximo atendimento.</p>
        </div>
        <span className={styles.count}>{customers.length} nesta visualização</span>
      </header>

      <details className={styles.create}>
        <summary>Cadastrar cliente manualmente</summary>
        <form action={createCustomerAction} className={styles.createForm}>
          <Input label="Nome" name="name" required minLength={2} />
          <Input label="Telefone" name="phone" type="tel" placeholder="(19) 99999-9999" />
          <Input label="E-mail" name="email" type="email" />
          <Input label="Nascimento" name="birthDate" type="date" />
          <Button type="submit">Cadastrar cliente</Button>
        </form>
      </details>

      <form method="get" className={`card ${styles.filters}`}>
        <Input label="Buscar cliente" name="q" defaultValue={search} placeholder="Nome, telefone ou e-mail" />
        <label className={styles.selectWrap}>
          <strong>Ordenar por</strong>
          <select name="sort" defaultValue={sort} className={styles.select}>
            <option value="recent">Mais recentes</option>
            <option value="spent">Maior valor gasto</option>
            <option value="orders">Mais pedidos</option>
            <option value="name">Nome A–Z</option>
          </select>
        </label>
        <Button tone="secondary" type="submit">Aplicar</Button>
      </form>

      <div className={styles.list}>
        {customers.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nenhum cliente encontrado</strong>
            <div>{search ? "Tente outro nome, telefone ou e-mail." : "Os clientes identificados nos pedidos aparecerão aqui automaticamente."}</div>
          </div>
        ) : customers.map((customer) => (
          <Link href={`/clientes/${customer.id}`} key={customer.id} className={styles.row}>
            <div className={styles.identity}>
              <span className={styles.name}>{customer.name}</span>
              <span className={styles.contact}>{customer.phone || customer.email || "Sem contato informado"}</span>
            </div>
            <div className={styles.stat}><span>Pedidos</span><strong>{customer.orders_count}</strong></div>
            <div className={styles.stat}><span>Total gasto</span><strong>{formatCents(Number(customer.total_spent_cents))}</strong></div>
            <div className={styles.stat}><span>Última compra</span><strong>{dateLabel(customer.last_order_at)}</strong></div>
            <span className={styles.open}>Abrir →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
