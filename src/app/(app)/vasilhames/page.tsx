import { adjustGasContainerAction, configureGasProductAction, createGasContainerTypeAction } from "@/features/gas-containers/actions";
import { GasContainerService } from "@/server/gas/gas-container-service";

const fieldStyle = { minHeight: 46, borderRadius: 10, border: "1px solid var(--color-border)", padding: "10px 12px", background: "var(--color-surface)", color: "inherit" } as const;
const cardStyle = { border: "1px solid var(--color-border)", borderRadius: 16, padding: 16, background: "var(--color-surface)" } as const;

export default async function GasContainersPage() {
  const { balances, profiles, products, movements } = await GasContainerService.load();
  const profileByProduct = new Map(profiles.map((profile) => [profile.product_id, profile]));

  return <section style={{ display: "grid", gap: "var(--space-5)" }}>
    <header>
      <p className="muted" style={{ margin: 0 }}>REVENDA DE GÁS · CONTROLE OPERACIONAL</p>
      <h1 style={{ marginBottom: 6 }}>Vasilhames</h1>
      <p className="muted" style={{ maxWidth: 760, margin: 0 }}>Controle cascos cheios, vazios e em rota sem misturar o saldo físico de vasilhames com o estoque comercial dos produtos.</p>
    </header>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
      {balances.length === 0 ? <div style={cardStyle}><strong>Nenhum tipo cadastrado</strong><p className="muted">Cadastre P13, P20, P45 ou outro vasilhame usado nesta unidade.</p></div> : balances.map((balance) => <article key={balance.container_type_id} style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{balance.code} · {balance.name}</strong>{balance.nominal_weight_kg ? <span className="muted">{Number(balance.nominal_weight_kg)} kg</span> : null}</div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 0 }}>
          <div><dt className="muted">Cheios</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{Number(balance.full_quantity)}</dd></div>
          <div><dt className="muted">Vazios</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{Number(balance.empty_quantity)}</dd></div>
          <div><dt className="muted">Em rota</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{Number(balance.in_route_quantity)}</dd></div>
        </dl>
      </article>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
      <form action={createGasContainerTypeAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
        <div><h2 style={{ margin: 0 }}>Cadastrar tipo</h2><p className="muted" style={{ marginBottom: 0 }}>Ex.: P13 · Botijão residencial.</p></div>
        <label style={{ display: "grid", gap: 6 }}><strong>Código</strong><input name="code" required maxLength={24} placeholder="P13" style={fieldStyle} /></label>
        <label style={{ display: "grid", gap: 6 }}><strong>Nome</strong><input name="name" required maxLength={100} placeholder="Botijão residencial" style={fieldStyle} /></label>
        <label style={{ display: "grid", gap: 6 }}><strong>Peso nominal (kg)</strong><input name="nominalWeightKg" inputMode="decimal" placeholder="13" style={fieldStyle} /></label>
        <button type="submit" style={{ ...fieldStyle, border: 0, background: "var(--color-primary)", color: "white", fontWeight: 900, cursor: "pointer" }}>Cadastrar vasilhame</button>
      </form>

      <form action={adjustGasContainerAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
        <div><h2 style={{ margin: 0 }}>Ajustar saldo</h2><p className="muted" style={{ marginBottom: 0 }}>Use somente para inventário inicial, correção ou recebimento manual. Informe o motivo.</p></div>
        <label style={{ display: "grid", gap: 6 }}><strong>Tipo</strong><select name="containerTypeId" required style={fieldStyle}><option value="">Selecione</option>{balances.filter((item) => item.active).map((item) => <option key={item.container_type_id} value={item.container_type_id}>{item.code} · {item.name}</option>)}</select></label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}><strong>Cheios ±</strong><input name="fullDelta" type="number" defaultValue={0} style={fieldStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><strong>Vazios ±</strong><input name="emptyDelta" type="number" defaultValue={0} style={fieldStyle} /></label>
          <label style={{ display: "grid", gap: 6 }}><strong>Em rota ±</strong><input name="inRouteDelta" type="number" defaultValue={0} style={fieldStyle} /></label>
        </div>
        <label style={{ display: "grid", gap: 6 }}><strong>Motivo</strong><input name="reason" required minLength={3} maxLength={500} placeholder="Ex.: inventário inicial" style={fieldStyle} /></label>
        <button type="submit" style={{ ...fieldStyle, border: 0, background: "var(--color-primary)", color: "white", fontWeight: 900, cursor: "pointer" }}>Registrar ajuste</button>
      </form>
    </div>

    <form action={configureGasProductAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
      <div><h2 style={{ margin: 0 }}>Vincular produto ao vasilhame</h2><p className="muted" style={{ marginBottom: 0 }}>A troca e o valor do casco passam a ser opções estruturadas no pedido; não use adicional livre para representar o vasilhame.</p></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}><strong>Produto</strong><select name="productId" required style={fieldStyle}><option value="">Selecione</option>{products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}{profileByProduct.has(item.id) ? " · configurado" : ""}</option>)}</select></label>
        <label style={{ display: "grid", gap: 6 }}><strong>Tipo de vasilhame</strong><select name="containerTypeId" required style={fieldStyle}><option value="">Selecione</option>{balances.filter((item) => item.active).map((item) => <option key={item.container_type_id} value={item.container_type_id}>{item.code} · {item.name}</option>)}</select></label>
        <label style={{ display: "grid", gap: 6 }}><strong>Valor adicional do casco</strong><input name="containerSurcharge" inputMode="decimal" placeholder="0,00" style={fieldStyle} /></label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <label><input name="exchangeEnabled" type="checkbox" defaultChecked /> Permitir troca de vasilhame</label>
        <label><input name="containerSaleEnabled" type="checkbox" defaultChecked /> Permitir produto + casco</label>
        <label><input name="requireContainerChoice" type="checkbox" defaultChecked /> Exigir escolha no pedido</label>
      </div>
      <button type="submit" style={{ ...fieldStyle, justifySelf: "start", border: 0, background: "var(--color-primary)", color: "white", fontWeight: 900, cursor: "pointer" }}>Salvar vínculo</button>
    </form>

    <article style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Movimentações recentes</h2>
      {movements.length === 0 ? <p className="muted">Ainda não há movimentações de vasilhames.</p> : <div style={{ display: "grid", gap: 8 }}>{movements.map((movement) => {
        const type = balances.find((item) => item.container_type_id === movement.container_type_id);
        return <div key={movement.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) repeat(3,minmax(70px,auto))", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
          <div><strong>{type?.code ?? "Vasilhame"}</strong><div className="muted">{movement.movement_kind.replaceAll("_", " ")} · {new Date(movement.created_at).toLocaleString("pt-BR")}</div>{movement.reason ? <small>{movement.reason}</small> : null}</div>
          <span>Cheios {Number(movement.full_delta) >= 0 ? "+" : ""}{movement.full_delta}</span><span>Vazios {Number(movement.empty_delta) >= 0 ? "+" : ""}{movement.empty_delta}</span><span>Rota {Number(movement.in_route_delta) >= 0 ? "+" : ""}{movement.in_route_delta}</span>
        </div>;
      })}</div>}
    </article>
  </section>;
}
