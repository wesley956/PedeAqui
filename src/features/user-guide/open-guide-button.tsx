"use client";

import { OPEN_GUIDE_EVENT } from "@/features/user-guide/guide-events";

export function OpenGuideButton({ className }: { className?: string }) {
  return <button type="button" className={className} onClick={(event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
  }}>Guia de primeiros passos</button>;
}
