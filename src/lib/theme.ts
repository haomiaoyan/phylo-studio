/** Apple system palette (dark variants), used to colour clades. */
export const CLADE_COLORS = [
  '#0a84ff',
  '#30d158',
  '#ff9f0a',
  '#bf5af2',
  '#64d2ff',
  '#ff375f',
  '#ffd60a',
  '#5e5ce6',
  '#ac8e68',
  '#8e8e93',
]

export function cladeColor(index: number): string {
  return CLADE_COLORS[index % CLADE_COLORS.length]
}

/** Sequential ramp for the distance heatmap, light → deep blue. */
const RAMP = ['#f2f6ff', '#c8ddff', '#8fbdf7', '#4f95e8', '#1b64c4', '#0a3576']

export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x))
  const f = x - i
  return mix(RAMP[i], RAMP[i + 1], f)
}

function mix(a: string, b: string, f: number): string {
  const pa = hex(a)
  const pb = hex(b)
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * f))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function hex(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
}

export function readableOn(hexColor: string): string {
  const [r, g, b] = hex(hexColor)
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return l > 0.62 ? '#0b1a33' : '#ffffff'
}
