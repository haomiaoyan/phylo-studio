/**
 * Sequence input handling: FASTA / plain text → normalised records.
 *
 * The parser is deliberately forgiving, because the paste box is the first
 * thing a visitor touches. Anything it silently discards is counted and
 * surfaced in the UI instead of vanishing.
 */

export interface SeqRecord {
  name: string
  description?: string
  seq: string
}

export interface ParseResult {
  records: SeqRecord[]
  warnings: string[]
}

const VALID = new Set(['A', 'C', 'G', 'T'])

function sanitize(raw: string): { seq: string; ambiguous: number; stripped: number } {
  let seq = ''
  let ambiguous = 0
  let stripped = 0
  for (const ch of raw) {
    const c = ch.toUpperCase()
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue
    if (c >= '0' && c <= '9') {
      // Line numbers pasted from GenBank/Ensembl views.
      stripped++
      continue
    }
    if (c === 'U') {
      seq += 'T'
      continue
    }
    if (VALID.has(c)) {
      seq += c
      continue
    }
    if (c === '-' || c === '.' || c === '*' || c === '~') {
      // Alignment gaps become unknown characters.
      seq += 'N'
      ambiguous++
      continue
    }
    if (c >= 'A' && c <= 'Z') {
      // IUPAC ambiguity codes (R, Y, K, M, S, W, B, D, H, V, N).
      seq += 'N'
      ambiguous++
      continue
    }
    ambiguous++
  }
  return { seq, ambiguous, stripped }
}

function dedupe(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return count === 0 ? name : `${name}_${count + 1}`
  })
}

export function parseSequences(text: string): ParseResult {
  const warnings: string[] = []
  const trimmed = text.replace(/\r\n?/g, '\n').trim()
  if (!trimmed) return { records: [], warnings: ['没有内容可解析。'] }

  const lines = trimmed.split('\n')
  const hasHeaders = lines.some((line) => line.trimStart().startsWith('>'))
  const records: SeqRecord[] = []
  let ambiguousTotal = 0
  let strippedTotal = 0

  if (hasHeaders) {
    let current: { name: string; description?: string; chunks: string[] } | null = null
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      if (t.startsWith('>')) {
        if (current) records.push(finish(current))
        current = readHeader(t.slice(1).trim(), records.length)
      } else if (current) {
        current.chunks.push(t)
      }
    }
    if (current) records.push(finish(current))
  } else {
    // No headers: treat the whole paste as a single sequence. Splitting on
    // newlines here would turn one wrapped sequence into N fake taxa.
    const { seq, ambiguous, stripped } = sanitize(trimmed)
    ambiguousTotal += ambiguous
    strippedTotal += stripped
    if (seq) records.push({ name: '输入序列', seq })
    warnings.push('没有检测到 FASTA 标题行（>），整段内容被当作 1 条序列处理。建树至少需要 2 条序列。')
  }

  function finish(rec: { name: string; description?: string; chunks: string[] }): SeqRecord {
    const { seq, ambiguous, stripped } = sanitize(rec.chunks.join(''))
    ambiguousTotal += ambiguous
    strippedTotal += stripped
    return { name: rec.name, description: rec.description, seq }
  }

  function readHeader(header: string, index: number): { name: string; description?: string; chunks: string[] } {
    const space = header.search(/\s/)
    const name = (space === -1 ? header : header.slice(0, space)).trim() || `Seq${index + 1}`
    const description = space === -1 ? undefined : header.slice(space + 1).trim() || undefined
    return { name, description, chunks: [] }
  }

  const cleaned = records.filter((r) => r.seq.length > 0)
  if (cleaned.length !== records.length) {
    warnings.push(`丢弃了 ${records.length - cleaned.length} 条空序列。`)
  }

  const names = dedupe(cleaned.map((r) => r.name))
  cleaned.forEach((r, i) => {
    r.name = names[i]
  })

  if (ambiguousTotal > 0) {
    warnings.push(`${ambiguousTotal} 个非 ACGT 字符（模糊碱基或空位）按未知处理，不参与距离计算。`)
  }
  if (strippedTotal > 0) {
    warnings.push(`忽略了 ${strippedTotal} 个数字字符（多来自序列行号）。`)
  }
  if (cleaned.length === 1) {
    warnings.push('只解析到 1 条序列，无法建树。')
  }

  const lengths = new Set(cleaned.map((r) => r.seq.length))
  if (lengths.size > 1) {
    const min = Math.min(...cleaned.map((r) => r.seq.length))
    const max = Math.max(...cleaned.map((r) => r.seq.length))
    warnings.push(`序列长度不一致（${min}–${max} nt），将自动逐对全局比对后再计算距离。`)
  }

  return { records: cleaned, warnings }
}

export function toFasta(records: SeqRecord[]): string {
  return records.map((r) => `>${r.name}${r.description ? ` ${r.description}` : ''}\n${wrap(r.seq)}`).join('\n')
}

export function wrap(seq: string, width = 70): string {
  const out: string[] = []
  for (let i = 0; i < seq.length; i += width) out.push(seq.slice(i, i + width))
  return out.join('\n')
}
