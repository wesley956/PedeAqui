import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAddressAction, removeCustomerAddressAction, setDefaultCustomerAddressAction } from "@/features/customers/actions";
import { CustomerService } from "@/server/customers/customer-service";
import { formatCents } from "@/server/catalog/money";
import styles from "../customers.module.css";

const orderStatusLabels: Record<string, string> = {
  pending_confirmation: "Aguardando confirmação",
  confirmed: "Confirmado",
  rejected: "Recusado",
  canceled: "Cancelado",
  completed: "Concluído",
};

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, addresses, orders, historyRestricted } = await CustomerService.profile(id);

  return (
    <section className={styles.page}>
      <header className={styles.profileHeader}>
        <div>
          <Link href="/clientes" className="muted">← Voltar para clientes</Link>
          <h1>{customer.name}</h1>
          <p className={styles.profileContact}>{customer.phone || customer.email || "Sem contato informado"}</p>
        </div>
        <div className={styles.countBadge}>Cliente desde {new Date(customer.created_at).toLocaleDateString("pt-BR")}</div>
      </header>

      <div className={styles.profileMetrics}>
        <article className={`card ${styles.metric}`}><span>PEDIDOS CONCLUÍDOS</span><strong>{customer.orders_count}</strong></article>
        <article className={`card ${styles.metric}`}><span>TOTAL GASTO</span><strong>{formatCents(Number(customer.total_spent_cents))}</strong></article>
        <article className={`card ${styles.metric}`}><span>TICKET MÉDIO</span><strong>{formatCents(customer.average_ticket_cents)}</strong></article>
        <article className={`card ${styles.metric}`}><span>ÚLTIMA COMPRA</span><strong>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString("pt-BR") : "—"}</strong></article>
      </div>

      <div className={styles.profileGrid}>
        <div style={{ display: "grid", gap: 16 }}>
          <article className={`card ${styles.sectionCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Dados do cliente</h2>
                <div className={styles.sectionSub}>Cadastro compartilhado pelas unidades da organização.</div>
              </div>
            </div>
            <Info label="Nome" value={customer.name} />
            <Info label="Telefone" value={customer.phone || "Não informado"} />
            <Info label="E-mail" value={customer.email || "Não informado"} />
            <Info label="Nascimento" value={customer.birth_date ? new Date(`${customer.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "Não informado"} />
          </article>

          <form action={createCustomerAddressAction} className={`card ${styles.sectionCard}`}>
            <input type="hidden" name="customerId" value={id} />
            <div>
              <h2>Novo endereço</h2>
              <div className={styles.sectionSub}>O primeiro endereço se torna principal automaticamente.</div>
            </div>
            <div className={styles.twoColumns}>
              <Input label="Identificação" name="label" defaultValue="Principal" required />
              <Input label="CEP" name="postalCode" inputMode="numeric" placeholder="13460-000" required />
            </div>
            <Input label="Rua / avenida" name="street" required />
            <div className={styles.twoColumns}>
              <Input label="Número" name="number" required />
              <Input label="Complemento" name="complement" />
            </div>
            <Input label="Bairro" name="district" required />
            <div className={styles.twoColumns}>
              <Input label="Cidade" name="city" required />
              <Input label="UF" name="state" maxLength={2} placeholder="SP" required />
            </div>
            <Input label="Nome de quem recebe" name="recipientName" />
            <Input label="Telefone do endereço" name="phone" type="tel" />
            <Input label="Referência" name="reference" placeholder="Ex.: portão preto" />
            <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <input type="checkbox" name="isDefault" />
              <span>Definir como endereço principal</span>
            </label>
            <Button type="submit">Adicionar endereço</Button>
          </form>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <article className={`card ${styles.sectionCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Histórico de pedidos</h2>
                <div className={styles.sectionSub}>Até 20 pedidos mais recentes nas unidades que você pode visualizar.</div>
              </div>
            </div>
            {historyRestricted ? <div className={styles.restricted}>Este cliente possui compras, mas seu papel atual não tem acesso ao histórico operacional dessas unidades.</div> : null}
            {orders.length === 0 && !historyRestricted ? <div className={styles.empty}>Nenhum pedido visível para este cliente.</div> : (
              <div className={styles.orderList}>
                {orders.map((order) => (
                  <div key={order.id} className={styles.orderRow}>
                    <div className={styles.orderTop}>
                      <div>
                        <strong>#{order.display_number} · {order.store_name}</strong>
                        <div className={styles.orderMeta}>{dateTime(order.created_at)} · {order.channel} · {order.fulfillment_type}</div>
                      </div>
                      <span className={styles.orderValue}>{formatCents(Number(order.total_cents))}</span>
                    </div>
                    <div className={styles.actions}>
                      <span className={styles.badge}>{orderStatusLabels[order.order_status] ?? order.order_status}</span>
                      <span className={styles.badge}>{order.payment_status === "paid" ? "Pago" : order.payment_status}</span>
                      <Link href={`/pedidos/${order.id}`} className={styles.orderLink}>Abrir pedido →</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className={`card ${styles.sectionCard}`}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Endereços</h2>
                <div className={styles.sectionSub}>{addresses.length} endereço(s) ativo(s).</div>
              </div>
            </div>
            {addresses.length === 0 ? <div className={styles.empty}>Nenhum endereço cadastrado.</div> : (
              <div className={styles.addressList}>
                {addresses.map((address) => (
                  <article key={address.id} className={styles.address}>
                    <div className={styles.addressTop}>
                      <div>
                        <div className={styles.actions}>
                          <strong>{address.label}</strong>
                          {address.is_default ? <span className={`${styles.badge} ${styles.badgeAccent}`}>Principal</span> : null}
                        </div>
                        <div className={styles.addressMeta}>{address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ""}<br />{address.district} · {address.city}/{address.state} · CEP {address.postal_code}{address.reference ? ` · Ref.: ${address.reference}` : ""}</div>
                      </div>
                    </div>
                    <div className={styles.actions}>
                      {!address.is_default ? (
                        <form action={setDefaultCustomerAddressAction}>
                          <input type="hidden" name="customerId" value={id} />
                          <input type="hidden" name="addressId" value={address.id} />
                          <Button tone="secondary" type="submit">Tornar principal</Button>
                        </form>
                      ) : null}
                      <form action={removeCustomerAddressAction}>
                        <input type="hidden" name="customerId" value={id} />
                        <input type="hidden" name="addressId" value={address.id} />
                        <Button tone="danger" type="submit">Remover</Button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span className="muted" style={{ fontSize: 10, fontWeight: 850 }}>{label.toUpperCase()}</span><div style={{ marginTop: 3 }}>{value}</div></div>;
}
