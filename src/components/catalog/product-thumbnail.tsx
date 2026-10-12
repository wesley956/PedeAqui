"use client";

import Image from "next/image";
import { useState } from "react";
import { NavigationIcon } from "@/components/ui/navigation-icon";

/** Display-only thumbnail: original URL/bytes remain unchanged; no paid image optimization. */
export function ProductThumbnail({ src, className }: { src?: string | null; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const image = src && src !== failedSource ? src : null;
  return <span className={className} aria-hidden="true">
    {image ? <Image src={image} alt="" width={64} height={64} unoptimized onError={() => setFailedSource(image)} /> : <NavigationIcon name="catalog" />}
  </span>;
}
