import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cruz",
  description: "Gestão, pedidos e operação para estabelecimentos alimentícios.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
