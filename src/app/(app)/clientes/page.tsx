import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAction } from "@/features/customers/actions";
import { CustomerService } from "@/server/customers/customer-service";
import { formatCents } from "@/server/catalog/money";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const customers = await CustomerService.list(params.q);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>Clientes</h1>
        <p className="muted">Base única da organização para delivery, PDV e futuro CRM.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <form action={createCustomerAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo cliente</h2>
          <Input label="Nome" name="name" required minLength={2} />
          <Input label="Telefone" name="phone" type="tel" placeholder="(19) 99999-9999" />
          <Input label="E-mail" name="email" type="email" />
          <Input label="Nascimento" name="birthDate" type="date" />
          <Button type="submit">Cadastrar cliente</Button>
        </form>

        <div style={{ display: "grid", gap: 12 }}>
          <form method="get" className="card" style={{ padding: 14, display: "flex", gap: 8, alignItems: "end" }}>
            <div style={{ flex: 1 }}><Input label="Buscar cliente" name="q" defaultValue={params.q ?? ""} placeholder="Nome" /></div>
            <Button tone="secondary" type="submit">Buscar</Button>
          </form>

          <div className="card" style={{ overflow: "hidden" }}>
            {customers.length === 0 ? (
              <div style={{ padding: 24 }}><strong>Nenhum cliente encontrado</strong><p className="muted" style={{ marginBottom: 0 }}>Os clientes criados aqui serão compartilhados entre as unidades da mesma organização.</p></div>
            ) : customers.map((customer) => (
              <Link href={`/clientes/${customer.id}`} key={customer.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) repeat(3, auto)", gap: 18, alignItems: "center", padding: 15, borderBottom: "1px solid var(--border)" }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{customer.name}</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{customer.phone || customer.email || "Sem contato informado"}</div>
                  <div style={{ color: "var(--accent)", fontSize: 11, fontWeight: 800, marginTop: 5 }}>GERENCIAR ENDEREÇOS →</div>
                </div>
                <div style={{ textAlign: "right" }}><span className="muted" style={{ fontSize: 11 }}>PEDIDOS</span><div>{customer.orders_count}</div></div>
                <div style={{ textAlign: "right" }}><span className="muted" style={{ fontSize: 11 }}>TOTAL</span><div>{formatCents(Number(customer.total_spent_cents))}</div></div>
                <div style={{ textAlign: "right" }}><span className="muted" style={{ fontSize: 11 }}>TICKET</span><div>{formatCents(customer.average_ticket_cents)}</div></div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
