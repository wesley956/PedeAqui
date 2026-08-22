export default function PlatformLoading() {
  return <main role="status" aria-live="polite" style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: 24 }}>
    <div style={{ display: "grid", gap: 8, textAlign: "center" }}><strong>Carregando o Painel do Proprietário…</strong><span>Estamos buscando apenas os dados necessários desta tela.</span></div>
  </main>;
}
