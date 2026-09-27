import { useMemo } from 'react';
import { cx } from '@/utils/misc';

/** Alturas deterministas a partir de un texto (misma onda para el mismo contenido). */
function heights(seed: string, n: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    const env = 0.55 + 0.45 * Math.sin((i / n) * Math.PI);
    out.push(0.18 + r * 0.82 * env);
  }
  return out;
}

/** Onda de audio de barras finas (estilo de la referencia). `progress` pinta lo ya reproducido. */
export function Waveform({ seed, bars = 48, progress = 0, levels, className }: { seed?: string; bars?: number; progress?: number; levels?: number[]; className?: string }) {
  const hs = useMemo(() => levels ?? heights(seed ?? 'onda', bars), [levels, seed, bars]);
  return (
    <span className={cx('waveform', className)} aria-hidden="true">
      {hs.map((v, i) => (
        <i key={i} className={i / hs.length < progress ? 'is-played' : undefined} style={{ transform: `scaleY(${Math.max(0.12, Math.min(1, v))})` }} />
      ))}
    </span>
  );
}
