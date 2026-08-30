/**
 * Renders a `local://...`-ref'd image via `useImageBlobUrl()` (ADR-007,
 * lib/image.ts) — a thin component wrapper because the hook can't be called
 * directly inside a `.map()` callback (rules of hooks).
 */
import type { CSSProperties } from 'react';
import { useImageBlobUrl } from '../lib/image';

interface AuthedImageProps {
  ref_: string | null | undefined; // "ref" is a reserved prop name in React
  alt: string;
  style?: CSSProperties;
}

export function AuthedImage({ ref_, alt, style }: AuthedImageProps) {
  const src = useImageBlobUrl(ref_);
  if (!src) return null;
  return <img src={src} alt={alt} style={style} />;
}
