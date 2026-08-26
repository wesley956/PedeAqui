"use client";

import { useEffect } from "react";

export function HomeClientRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main>
      <p>Redirecionando para o PedeAqui...</p>
      <p>
        <a href={href}>Continuar</a>
      </p>
    </main>
  );
}
