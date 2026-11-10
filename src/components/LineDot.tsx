import type { Line } from '../data/types';

/** Readable foreground for an arbitrary line colour (WCAG relative luminance). */
export function contrastOn(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const srgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.55 ? '#15181e' : '#ffffff';
}

interface Props {
  line: Line;
  size?: 'xs' | 'sm' | 'md';
  showCode?: boolean;
}

/** A coloured line badge, e.g. a yellow pill reading "Yellow Line". */
export function LineDot({ line, size = 'sm', showCode = false }: Props) {
  const pad =
    size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[13px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold leading-none ring-1 ring-black/5 ${pad}`}
      style={{ background: line.color, color: contrastOn(line.color) }}
    >
      {line.name}
      {showCode && <span className="opacity-70">· {line.code}</span>}
    </span>
  );
}
