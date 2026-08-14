import type { ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <section className="card" style={{ width: "min(100%, 420px)", padding: 24, display: "grid", gap: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
            <PedeAquiLogo size="md" priority />
          </div>
          <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
