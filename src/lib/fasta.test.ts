import { describe, expect, it } from 'vitest'
import { distanceMatrix, encode, pairDistance, alignPair, MODEL_LABEL } from './distance'
import { parseSequences, toFasta } from './fasta'

const seq = (s: string) => encode(s)

describe('pairDistance', () => {
  it('counts p-distance over comparable sites', () => {
    const r = pairDistance(seq('ACGTACGT'), seq('ACGTTCGT'), 'p')
    expect(r.sites).toBe(8)
    expect(r.d).toBeCloseTo(1 / 8, 10)
  })

  it('ignores unknown characters entirely', () => {
    const r = pairDistance(seq('ACGTNNNN'), seq('ACGTACGT'), 'p')
    expect(r.sites).toBe(4)
    expect(r.d).toBe(0)
  })

  it('returns zero for identical sequences under every model', () => {
    for (const model of Object.keys(MODEL_LABEL) as Array<'p' | 'jc' | 'k2p'>) {
      expect(pairDistance(seq('ACGTACGTAC'), seq('ACGTACGTAC'), model).d).toBe(0)
    }
  })

  it('JC correction exceeds p-distance and flags saturation', () => {
    const a = seq('AAAAAAAAAA')
    const b = seq('CCCCCCCCCC')
    const jc = pairDistance(a, b, 'jc')
    expect(jc.saturated).toBe(true)
    const mild = pairDistance(seq('ACGTACGTAC'), seq('ACGTTCGTTC'), 'jc')
    expect(mild.d).toBeGreaterThan(0.2)
  })

  it('K2P separates transitions from transversions', () => {
    // A->G is a transition; A->C is a transversion. Same p, different K2P.
    const ts = pairDistance(seq('AAAAAAAA'), seq('AAAAAAAG'), 'k2p')
    const tv = pairDistance(seq('AAAAAAAA'), seq('AAAAAAAC'), 'k2p')
    expect(ts.d).not.toBeCloseTo(tv.d, 4)
    expect(ts.saturated || tv.saturated).toBe(false)
  })

  it('matrix is symmetric with a zero diagonal', () => {
    const codes = [seq('ACGTACGT'), seq('ACGTTCGA'), seq('TTTTACGT')]
    const { matrix } = distanceMatrix(codes, 'p')
    expect(matrix[0][0]).toBe(0)
    expect(matrix[0][1]).toBe(matrix[1][0])
    // ACGTACGT vs TTTTACGT differ at the first three positions only.
    expect(matrix[0][2]).toBeCloseTo(3 / 8, 10)
  })
})

describe('alignPair', () => {
  it('recovers an ungapped alignment for equal sequences', () => {
    const { a, b, score } = alignPair('ACGT', 'ACGT')
    expect(a).toBe('ACGT')
    expect(b).toBe('ACGT')
    expect(score).toBe(8)
  })

  it('inserts a gap for a deletion', () => {
    const { a, b } = alignPair('ACGTACGT', 'ACGACGT')
    expect(a.length).toBe(b.length)
    expect(a).toBe('ACGTACGT')
    expect(b).toBe('ACG-ACGT')
  })

  it('keeps the longer sequence intact when it contains the shorter', () => {
    const { a, b } = alignPair('ACGTTTACGT', 'ACGT')
    const ungapped = b.replace(/-/g, '')
    expect(ungapped).toBe('ACGT')
    expect(a.replace(/-/g, '')).toBe('ACGTTTACGT')
  })
})

describe('parseSequences', () => {
  it('reads multi-record FASTA and lowercases', () => {
    const { records } = parseSequences('>a first\nacgt\n>b\nACGTACGT\n')
    expect(records.map((r) => r.name)).toEqual(['a', 'b'])
    expect(records[0].seq).toBe('ACGT')
    expect(records[0].description).toBe('first')
  })

  it('treats a headerless paste as one sequence', () => {
    const { records, warnings } = parseSequences('ACGT\nACGT\n')
    expect(records).toHaveLength(1)
    expect(records[0].seq).toBe('ACGTACGT')
    expect(warnings.join(' ')).toContain('FASTA')
  })

  it('strips digits, maps U to T, converts ambiguity to N', () => {
    const { records, warnings } = parseSequences('>x\n1 ACGU RYKM\n2 ACGT\n')
    expect(records[0].seq).toBe('ACGTNNNNACGT')
    expect(warnings.join(' ')).toContain('模糊碱基')
    expect(warnings.join(' ')).toContain('数字')
  })

  it('de-duplicates repeated names', () => {
    const { records } = parseSequences('>a\nACGT\n>a\nACGT\n>a\nTTTT\n')
    expect(records.map((r) => r.name)).toEqual(['a', 'a_2', 'a_3'])
  })

  it('reports unequal lengths', () => {
    const { warnings } = parseSequences('>a\nACGT\n>b\nACGTA\n')
    expect(warnings.join(' ')).toContain('长度不一致')
  })

  it('round-trips through toFasta', () => {
    const fasta = '>a\nACGTACGTAC\n>b\nTTTTACGTAC\n'
    const { records } = parseSequences(fasta)
    expect(parseSequences(toFasta(records)).records.map((r) => r.seq)).toEqual(
      records.map((r) => r.seq),
    )
  })
})
