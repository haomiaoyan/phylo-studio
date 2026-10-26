import { beforeEach, describe, expect, it } from 'vitest'
import {
  applySupport,
  bootstrap,
  buildTree,
  layoutTree,
  mulberry32,
  neighborJoining,
  resetIds,
  tipDistances,
  toNewick,
  treeSplits,
  upgma,
} from './tree'

beforeEach(() => resetIds())

/** Classic textbook matrix where UPGMA and NJ agree on the topology. */
const textbook = [
  [0, 2, 4, 4],
  [2, 0, 4, 4],
  [4, 4, 0, 2],
  [4, 4, 2, 0],
]

describe('upgma', () => {
  it('pairs the two closest taxa first', () => {
    const root = upgma(textbook)
    const left = root.children[0]
    const right = root.children[1]
    expect(left.children.map((c) => c.leaf).sort()).toEqual([0, 1])
    expect(right.children.map((c) => c.leaf).sort()).toEqual([2, 3])
  })

  it('gives branch lengths that reproduce the input distances', () => {
    const root = upgma(textbook)
    // d(0,1)=2 coalesces at height 1 -> each tip limb is 1; the root sits at
    // height 2, so the (0,1) ancestor's limb up to the root is 1 as well.
    expect(root.children[0].children[0].length).toBeCloseTo(1, 10)
    expect(root.children[0].children[1].length).toBeCloseTo(1, 10)
    expect(root.children[0].length).toBeCloseTo(1, 10)
  })

  it('handles a single taxon', () => {
    const root = upgma([[0]])
    expect(root.children).toHaveLength(0)
    expect(root.leaf).toBe(0)
  })
})

describe('neighborJoining', () => {
  it('recovers the correct split for a four-taxon tree', () => {
    // True tree ((A,B),(C,D)) with equal limbs -> NJ must find it.
    const d = [
      [0, 1, 3, 3],
      [1, 0, 3, 3],
      [3, 3, 0, 1],
      [3, 3, 1, 0],
    ]
    const root = neighborJoining(d)
    const groups = root.children.map((c) => leafGroup(c)).sort((a, b) => a[0] - b[0])
    expect(groups).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('handles two taxa by splitting the distance in half', () => {
    const root = neighborJoining([
      [0, 4],
      [4, 0],
    ])
    expect(root.children).toHaveLength(2)
    expect(root.children[0].length).toBeCloseTo(2, 10)
  })

  it('produces a tree for a random asymmetric matrix', () => {
    const rng = mulberry32(7)
    const n = 6
    const d = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = 0.1 + rng() * 2
        d[i][j] = v
        d[j][i] = v
      }
    }
    const root = neighborJoining(d)
    expect(countLeaves(root)).toBe(n)
    expect(tipDistances(root)).toHaveLength(n)
  })
})

function leafGroup(node: { children: Array<{ children: unknown[]; leaf?: number }>; leaf?: number }): number[] {
  const out: number[] = []
  const walk = (n: { children: unknown[]; leaf?: number }) => {
    const kids = n.children as Array<{ children: unknown[]; leaf?: number }>
    if (kids.length === 0) out.push(n.leaf ?? 0)
    else kids.forEach(walk)
  }
  walk(node)
  return out.sort((a, b) => a - b)
}

function countLeaves(node: { children: unknown[] }): number {
  const kids = node.children as Array<{ children: unknown[] }>
  if (kids.length === 0) return 1
  return kids.reduce((s, c) => s + countLeaves(c), 0)
}

describe('buildTree', () => {
  it('dispatches by method', () => {
    expect(countLeaves(buildTree(textbook, 'upgma'))).toBe(4)
    expect(countLeaves(buildTree(textbook, 'nj'))).toBe(4)
  })
})

describe('toNewick', () => {
  it('writes a parsable Newick with labels and lengths', () => {
    const root = upgma(textbook)
    const nwk = toNewick(root, ['A', 'B', 'C', 'D'], 3)
    expect(nwk.endsWith(';')).toBe(true)
    expect(nwk).toBe('((A:1,B:1):1,(C:1,D:1):1):0;')
  })

  it('quotes labels that contain spaces or punctuation', () => {
    const root = upgma([
      [0, 1],
      [1, 0],
    ])
    const nwk = toNewick(root, ['Homo sapiens', "O'Brien"], 3)
    expect(nwk).toContain("'Homo sapiens'")
    expect(nwk).toContain("'O''Brien'")
  })
})

describe('layout', () => {
  const root = upgma(textbook)
  const layout = layoutTree(root, { gap: 0.4 })

  it('normalises every tip onto the unit circle', () => {
    for (const leaf of layout.leaves) expect(leaf.radius).toBeCloseTo(1, 10)
  })

  it('places leaves in strictly increasing rows', () => {
    const rows = layout.leaves.map((l) => l.row)
    expect(rows).toEqual([...rows].sort((a, b) => a - b))
    expect(new Set(rows).size).toBe(rows.length)
  })

  it('places internal nodes between their children angularly', () => {
    const inner = layout.byId.get(root.children[0].id)!
    const angles = inner.children.map((id) => layout.byId.get(id)!.angle)
    const mid = Math.atan2(
      Math.sin(angles[0]) + Math.sin(angles[1]),
      Math.cos(angles[0]) + Math.cos(angles[1]),
    )
    expect(inner.angle).toBeCloseTo(mid, 10)
  })

  it('keeps internal rows as the midpoint of their children', () => {
    const inner = layout.byId.get(root.children[0].id)!
    const rows = inner.children.map((id) => layout.byId.get(id)!.row)
    expect(inner.row).toBeCloseTo((rows[0] + rows[1]) / 2, 10)
  })
})

describe('splits and bootstrap', () => {
  it('finds the two internal splits of a four-taxon tree', () => {
    const root = upgma(textbook)
    const splits = treeSplits(root, 4)
    expect(splits.size).toBe(2)
    expect([...splits.keys()].sort()).toEqual(['0,1', '2,3'])
  })

  it('gives 100% support to splits that always reappear', () => {
    const columns = [0, 1, 2, 3]
    const result = bootstrap(4, columns, 20, () => upgma(textbook))
    expect(result.replicates).toBe(20)
    expect([...result.splits.values()].every((v) => v === 100)).toBe(true)
  })

  it('applies support back onto the tree', () => {
    const root = upgma(textbook)
    const result = bootstrap(4, [0, 1, 2, 3], 10, () => upgma(textbook))
    applySupport(root, 4, result)
    expect(root.children[0].support).toBe(100)
  })
})
