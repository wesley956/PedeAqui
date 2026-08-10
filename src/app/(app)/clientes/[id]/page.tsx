import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAddressAction, removeCustomerAddressAction, setDefaultCustomerAddressAction } from "@/features/customers/actions";
import { CustomerAddressService } from "@/server/customers/address-service";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, addresses } = await CustomerAddressService.list(id);

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header>
        <Link href="/clientes" className="muted">← Voltar para clientes</Link>
        <h1 style={{ margin: "8px 0 4px" }}>{customer.name}</h1>
        <p className="muted" style={{ margin: 0 }}>{customer.phone || customer.email || "Sem contato informado"}</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 420px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <form action={createCustomerAddressAction} className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <input type="hidden" name="customerId" value={id} />
          <h2 style={{ margin: 0, fontSize: 18 }}>Novo endereço</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Identificação" name="label" defaultValue="Principal" required />
            <Input label="CEP" name="postalCode" inputMode="numeric" placeholder="13460-000" required />
          </div>
          <Input label="Rua / avenida" name="street" required />
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <Input label="Número" name="number" required />
            <Input label="Complemento" name="complement" />
          </div>
          <Input label="Bairro" name="district" required />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10 }}>
            <Input label="Cidade" name="city" required />
            <Input label="UF" name="state" maxLength={2} placeholder="SP" required />
          </div>
          <Input label="Nome de quem recebe" name="recipientName" />
          <Input label="Telefone do endereço" name="phone" type="tel" />
          <Input label="Referência" name="reference" placeholder="Ex.: portão preto, ao lado da farmácia" />
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="isDefault" />
            <span>Definir como endereço principal</span>
          </label>
          <Button type="submit">Adicionar endereço</Button>
        </form>

        <div className="card" style={{ overflow: "hidden" }}>
          {addresses.length === 0 ? (
            <div style={{ padding: 24 }}>
              <strong>Nenhum endereço cadastrado</strong>
              <p className="muted" style={{ marginBottom: 0 }}>O primeiro endereço adicionado se torna principal automaticamente.</p>
            </div>
          ) : addresses.map((address) => (
            <article key={address.id} style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{address.label}</strong>
                    {address.is_default ? <span style={{ fontSize: 10, fontWeight: 900, color: "var(--accent)" }}>PRINCIPAL</span> : null}
                  </div>
                  <div className="muted" style={{ marginTop: 5 }}>{address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ""}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{address.district} · {address.city}/{address.state} · CEP {address.postal_code}</div>
                  {address.reference ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ref.: {address.reference}</div> : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
      </div>
    </section>
  );
}
