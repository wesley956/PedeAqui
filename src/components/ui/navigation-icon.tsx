import type { SVGProps } from "react";

const paths: Record<string, string> = {
  dashboard: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7",
  orders: "M9 4H5v17h14V4h-4 M9 3h6v4H9z M8 11h8 M8 15h6",
  conversations: "M21 11a8 8 0 0 1-8 8H8l-5 3v-6a8 8 0 1 1 18-5Z",
  dining: "M3 3h18v18H3z M3 11h18 M11 3v18",
  catalog: "M12 5C9 3 5 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z M12 5v16",
  pdv: "M3 4h18v13H3z M8 21h8 M12 17v4",
  cash: "M3 5h18v14H3z M3 10h18 M7 15h3 M16 14v2",
  finance: "M3 3v18h18 M6 15l5-5 4 3 6-8",
  fiscal: "M5 3h14v18l-3-2-4 2-4-2-3 2Z M8 8h8 M8 12h8",
  production: "M12 3c1 6 7 7 7 13a7 7 0 0 1-14 0c0-3 2-5 3-7 0 4 2 5 4 6 1-4 0-8 0-12Z",
  deliveries: "M3 6h11v12H3z M14 10h4l3 4v4h-7 M5 18a2 2 0 1 0 4 0 M15 18a2 2 0 1 0 4 0",
  driver: "M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z M9 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  inventory: "m3 7 9-4 9 4v10l-9 4-9-4Z M3 7l9 4 9-4 M12 11v10",
  gas_containers: "M9 3h6v4H9z M7 7h10l2 4v9H5v-9Z M5 14h14",
  suppliers: "M3 21V9l6-4v16 M9 11l6-4v14 M15 13l6-4v12 M3 21h18",
  purchases: "M3 3h2l3 13h11l2-9H6 M9 20h1 M17 20h1",
  customers: "M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M4 21v-3a8 8 0 0 1 16 0v3",
  growth: "M3 17l6-6 4 4 8-10 M15 5h6v6",
  scale: "M3 21h18 M5 21V7h6v14 M11 21V3h8v18 M14 7h2 M14 11h2 M14 15h2",
  team: "M6 7a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M3 21v-4a6 6 0 0 1 12 0v4 M16 4a3 3 0 0 1 0 6 M18 14a4 4 0 0 1 3 4v3",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  platform: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  more: "M4 5h16 M4 12h16 M4 19h16",
};

/** Shared repository-native stroke icons, independent of platform emoji fonts. */
export function NavigationIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: string }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={paths[name] ?? paths.platform} /></svg>;
}
