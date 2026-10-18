"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

/**
 * Imagem com substituto: se o arquivo não carregar (link quebrado, projeto antigo, arquivo apagado),
 * mostra o substituto em vez do ícone de imagem quebrada ou de um espaço vazio.
 * O ref cobre o caso em que a imagem já falhou antes de o React assumir a página.
 */
export function FallbackImage({ fallback, src, alt = "", ...image }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { src: string; fallback: ReactNode }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!src || failedSource === src) return <>{fallback}</>;
  // Fotos do cardápio já são WebP no tamanho certo; links antigos de qualquer origem continuam funcionando.
  // eslint-disable-next-line @next/next/no-img-element
  return <img
    {...image}
    src={src}
    alt={alt}
    ref={(element) => { if (element && element.complete && element.naturalWidth === 0) setFailedSource(src); }}
    onError={() => setFailedSource(src)}
  />;
}
