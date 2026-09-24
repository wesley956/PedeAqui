import type { Viewport } from "next";
import "./checkout-viewport.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function CheckoutViewportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="checkout-visual-viewport">{children}</div>;
}
