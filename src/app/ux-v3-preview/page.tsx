import type { Metadata } from "next";
import { PreviewExperience } from "./preview-experience";

export const metadata: Metadata = {
  title: "Preview UX v3",
  description: "Prévia navegável do redesign do painel PedeAqui.",
};

export default function UxV3PreviewPage() {
  return <PreviewExperience />;
}
