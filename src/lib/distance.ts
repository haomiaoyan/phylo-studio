/**
 * Genetic distances and the pairwise global aligner used when sequences do
 * not arrive pre-aligned.
 */

export type Model = 'p' | 'jc' | 'k2p'

export const MODEL_LABEL: Record<Model, string> = {
  p: 'p-distance',
  jc: 'Jukes–Cantor',
  k2p: 'Kimura 2P',
}

/** A=0 C=1 G=2 T=3, anything else = 4 (unknown). */
export function encode(seq: string): Uint8Array {
  const out = new Uint8Array(seq.length)
  for (let i = 0; i < seq.length; i++) {
    const c = seq.charCodeAt(i)
    out[i] = c === 65 ? 0 : c === 67 ? 1 : c === 71 ? 2 : c === 84 ? 3 : 4
  }
  return out
}

export interface PairDistance {
  d: number
  sites: number
  saturated: boolean
}

export function pairDistance(a: Uint8Array, b: Uint8Array, model: Model, cols?: number[]): PairDistance {
  const len = cols ? cols.length : Math.min(a.length, b.length)
  let sites = 0
  let diff = 0
  let ts = 0
  let tv = 0
  for (let i = 0; i < len; i++) {
    const idx = cols ? cols[i] : i
    const x = a[idx]
    const y = b[idx]
    if (x === 4 || y === 4) continue
    sites++
    if (x !== y) {
      diff++
      const purineX = x === 0 || x === 2
      const purineY = y === 0 || y === 2
      if (purineX === purineY) ts++
      else tv++
    }
  }
  if (sites === 0) return { d: 0, sites: 0, saturated: false }
  if (model === 'p') return { d: diff / sites + 0, sites, saturated: false }

  if (model === 'jc') {
    const p = diff / sites
    const term = 1 - (4 / 3) * p
    if (term <= 0.01) return { d: 3, sites, saturated: true }
    return { d: (-3 / 4) * Math.log(term) + 0, sites, saturated: false }
  }

  // Kimura two-parameter.
  const P = ts / sites
  const Q = tv / sites
  const t1 = 1 - 2 * P - Q
  const t2 = 1 - 2 * Q
  if (t1 <= 0.01 || t2 <= 0.01) return { d: 10, sites, saturated: true }
  return { d: -0.5 * Math.log(t1) - 0.25 * Math.log(t2) + 0, sites, saturated: false }
}

export interface MatrixResult {
  matrix: number[][]
  saturated: number
  meanDistance: number
}

export function distanceMatrix(
  codes: Uint8Array[],
  model: Model,
  cols?: number[],
): MatrixResult {
  const n = codes.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  let saturated = 0
  let sum = 0
  let pairs = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const res = pairDistance(codes[i], codes[j], model, cols)
      if (res.saturated) saturated++
      matrix[i][j] = res.d
      matrix[j][i] = res.d
      sum += res.d
      pairs++
    }
  }
  return { matrix, saturated, meanDistance: pairs ? sum / pairs : 0 }
}

export interface Alignment {
  a: string
  b: string
  score: number
}

/**
 * Needleman–Wunsch global alignment, linear gap penalty.
 * Only used for unequal-length input; equal-length input keeps its columns.
 */
export function alignPair(seqA: string, seqB: string): Alignment {
  const a = seqA.toUpperCase()
  const b = seqB.toUpperCase()
  const n = a.length
  const m = b.length
  const MATCH = 2
  const MISMATCH = -1
  const GAP = -2

  const w = m + 1
  const score = new Int32Array((n + 1) * w)
  for (let j = 1; j <= m; j++) score[j] = j * GAP
  for (let i = 1; i <= n; i++) score[i * w] = i * GAP

  for (let i = 1; i <= n; i++) {
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const cb = b.charCodeAt(j - 1)
      const diag = score[(i - 1) * w + (j - 1)] + (ca === cb ? MATCH : MISMATCH)
      const up = score[(i - 1) * w + j] + GAP
      const left = score[i * w + (j - 1)] + GAP
      score[i * w + j] = Math.max(diag, up, left)
    }
  }

  let i = n
  let j = m
  const outA: string[] = []
  const outB: string[] = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const ca = a.charCodeAt(i - 1)
      const cb = b.charCodeAt(j - 1)
      const diag = score[(i - 1) * w + (j - 1)] + (ca === cb ? MATCH : MISMATCH)
      if (score[i * w + j] === diag) {
        outA.push(a[i - 1])
        outB.push(b[j - 1])
        i--
        j--
        continue
      }
    }
    if (i > 0 && score[i * w + j] === score[(i - 1) * w + j] + GAP) {
      outA.push(a[i - 1])
      outB.push('-')
      i--
      continue
    }
    outA.push('-')
    outB.push(b[j - 1])
    j--
  }
  outA.reverse()
  outB.reverse()
  return { a: outA.join(''), b: outB.join(''), score: score[n * w + m] }
}
