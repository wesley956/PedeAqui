"use client";

import type { ReactNode } from "react";

/** Keep fields mounted and expose native validation errors before focus moves. */
export function FormDisclosure({ summary, children, className }: { summary: string; children: ReactNode; className?: string }) {
  return <details className={className} onInvalidCapture={(event) => { event.currentTarget.open = true; }}>
    <summary>{summary}</summary>
    {children}
  </details>;
}
