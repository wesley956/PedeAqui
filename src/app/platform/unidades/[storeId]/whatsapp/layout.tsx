import Link from "next/link";
import type { ReactNode } from "react";

export default async function PlatformWhatsAppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return (
    <>
      <nav
        aria-label="Configuração do WhatsApp"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: "12px 18px 0",
          maxWidth: 1440,
          margin: "0 auto",
        }}
      >
        <Link href={`/platform/unidades/${storeId}/whatsapp`} style={{ fontWeight: 800 }}>Conexão manual</Link>
        <span aria-hidden="true">·</span>
        <Link href={`/platform/unidades/${storeId}/whatsapp/notificacoes`} style={{ fontWeight: 800 }}>Notificações automáticas</Link>
      </nav>
      {children}
    </>
  );
}
