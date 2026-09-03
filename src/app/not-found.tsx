import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <section aria-labelledby="not-found-title" style={{ maxWidth: 560, textAlign: "center" }}>
        <p aria-hidden="true" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em" }}>
          ERRO 404
        </p>
        <h1 id="not-found-title">Página não encontrada</h1>
        <p>
          O endereço pode ter mudado ou não existir mais. Volte para uma área segura do PedeAqui e tente novamente.
        </p>
        <p>
          <Link href="/dashboard">Ir para o painel</Link>
          {" · "}
          <Link href="/">Ir para a página inicial</Link>
        </p>
      </section>
    </main>
  );
}
