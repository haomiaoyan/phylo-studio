/**
 * Tree construction and layout.
 *
 * Two clustering methods, both driven by the same distance matrix:
 *   - UPGMA (average linkage): fast, assumes an ultrametric clock.
 *   - Neighbor-Joining: the standard for real sequence data, no clock assumed.
 */

export interface TreeNode {
  id: string
  /** Leaf label. Undefined for internal nodes. */
  name?: string
  /** Branch length to the parent. */
  length: number
  children: TreeNode[]
  /** Bootstrap support in percent, internal nodes only. */
  support?: number
  /** Index into the original taxon array, leaves only. */
  leaf?: number
}

export type Method = 'upgma' | 'nj'

interface Cluster {
  node: TreeNode
  members: number[]
}

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}${counter}`
}

export function resetIds(): void {
  counter = 0
}

function leafNodes(n: number): Cluster[] {
  return Array.from({ length: n }, (_, i) => ({
    node: { id: nextId('n'), name: `t${i}`, length: 0, children: [], leaf: i },
    members: [i],
  }))
}

/** UPGMA — average-linkage hierarchical clustering. */
export function upgma(dist: number[][]): TreeNode {
  const n = dist.length
  if (n === 0) throw new Error('没有可用的分类单元。')
  if (n === 1) return { id: nextId('n'), name: 't0', length: 0, children: [], leaf: 0 }

  let clusters = leafNodes(n)
  // Working distance matrix over cluster indices.
  let d: number[][] = dist.map((row) => row.slice())
  const sizes = new Array<number>(n).fill(1)
  const heights = new Array<number>(n).fill(0)

  while (clusters.length > 1) {
    let bi = 0
    let bj = 1
    let best = Infinity
    for (let i = 0; i < d.length; i++) {
      for (let j = i + 1; j < d.length; j++) {
        if (d[i][j] < best) {
          best = d[i][j]
          bi = i
          bj = j
        }
      }
    }
    const height = best / 2
    const left = clusters[bi]
    const right = clusters[bj]
    left.node.length = Math.max(0, height - heights[bi])
    right.node.length = Math.max(0, height - heights[bj])

    const merged: Cluster = {
      node: {
        id: nextId('n'),
        length: 0,
        children: [left.node, right.node],
      },
      members: [...left.members, ...right.members],
    }

    // Weighted average of distances, sizes tracked separately.
    const newRow: number[] = []
    for (let k = 0; k < d.length; k++) {
      if (k === bi || k === bj) continue
      newRow.push((d[bi][k] * sizes[bi] + d[bj][k] * sizes[bj]) / (sizes[bi] + sizes[bj]))
    }
    const keep: number[] = []
    for (let k = 0; k < d.length; k++) if (k !== bi && k !== bj) keep.push(k)

    const nextD: number[][] = []
    const nextSizes: number[] = []
    const nextHeights: number[] = []
    const nextClusters: Cluster[] = []
    for (let a = 0; a < keep.length; a++) {
      const row: number[] = []
      for (let b = 0; b < keep.length; b++) row.push(d[keep[a]][keep[b]])
      row.push(newRow[a])
      nextD.push(row)
      nextSizes.push(sizes[keep[a]])
      nextHeights.push(heights[keep[a]])
      nextClusters.push(clusters[keep[a]])
    }
    nextD.push([...newRow, 0])
    nextSizes.push(sizes[bi] + sizes[bj])
    nextHeights.push(height)
    nextClusters.push(merged)

    d = nextD
    clusters = nextClusters
    sizes.length = 0
    sizes.push(...nextSizes)
    heights.length = 0
    heights.push(...nextHeights)
  }
  return clusters[0].node
}

/** Neighbor-Joining (Saitou & Nei 1987). */
export function neighborJoining(dist: number[][]): TreeNode {
  const n = dist.length
  if (n === 0) throw new Error('没有可用的分类单元。')
  if (n === 1) return { id: nextId('n'), name: 't0', length: 0, children: [], leaf: 0 }
  if (n === 2) {
    const [a, b] = leafNodes(2)
    a.node.length = dist[0][1] / 2
    b.node.length = dist[0][1] / 2
    return { id: nextId('n'), length: 0, children: [a.node, b.node] }
  }

  let clusters = leafNodes(n)
  let d: number[][] = dist.map((row) => row.slice())

  while (clusters.length > 2) {
    const m = d.length
    const r = new Array<number>(m).fill(0)
    for (let i = 0; i < m; i++) {
      let sum = 0
      for (let k = 0; k < m; k++) sum += d[i][k]
      r[i] = sum
    }
    let bi = 0
    let bj = 1
    let best = Infinity
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const q = (m - 2) * d[i][j] - r[i] - r[j]
        if (q < best) {
          best = q
          bi = i
          bj = j
        }
      }
    }
    const limbI = 0.5 * d[bi][bj] + (r[bi] - r[bj]) / (2 * (m - 2))
    const limbJ = d[bi][bj] - limbI
    clusters[bi].node.length = Math.max(0, limbI)
    clusters[bj].node.length = Math.max(0, limbJ)

    const merged: Cluster = {
      node: { id: nextId('n'), length: 0, children: [clusters[bi].node, clusters[bj].node] },
      members: [...clusters[bi].members, ...clusters[bj].members],
    }

    const keep: number[] = []
    for (let k = 0; k < m; k++) if (k !== bi && k !== bj) keep.push(k)
    const newRow: number[] = keep.map((k) => 0.5 * (d[bi][k] + d[bj][k] - d[bi][bj]))

    const nextD: number[][] = []
    const nextClusters: Cluster[] = []
    for (let a = 0; a < keep.length; a++) {
      const row: number[] = []
      for (let b = 0; b < keep.length; b++) row.push(d[keep[a]][keep[b]])
      row.push(newRow[a])
      nextD.push(row)
      nextClusters.push(clusters[keep[a]])
    }
    nextD.push([...newRow, 0])
    nextClusters.push(merged)
    d = nextD
    clusters = nextClusters
  }

  // Final two clusters.
  const [a, b] = clusters
  const dab = d[0][1]
  a.node.length = Math.max(0, dab / 2)
  b.node.length = Math.max(0, dab / 2)
  const root: TreeNode = {
    id: nextId('n'),
    length: 0,
    children: [a.node, b.node],
  }
  return root
}

export function buildTree(dist: number[][], method: Method): TreeNode {
  return method === 'upgma' ? upgma(dist) : neighborJoining(dist)
}

/* -------------------------------------------------------------------------- */
/* Newick                                                                      */
/* -------------------------------------------------------------------------- */

const NEWICK_SAFE = /^[A-Za-z0-9_.\-]+$/

function quoteLabel(name: string): string {
  if (NEWICK_SAFE.test(name)) return name
  return `'${name.replace(/'/g, "''")}'`
}

export function toNewick(root: TreeNode, labels: string[], decimals = 6): string {
  const fmt = (v: number) => {
    const s = v.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '')
    return s === '' || s === '-' ? '0' : s
  }
  const walk = (node: TreeNode, isRoot: boolean): string => {
    if (node.children.length === 0) {
      const label = labels[node.leaf ?? 0] ?? node.name ?? ''
      return `${quoteLabel(label)}:${fmt(node.length)}`
    }
    const inner = node.children.map((c) => walk(c, false)).join(',')
    const support =
      !isRoot && node.support !== undefined && node.support < 100 ? `${Math.round(node.support)}` : ''
    return `(${inner})${support}:${fmt(node.length)}`
  }
  return `${walk(root, true)};`
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                   */
/* -------------------------------------------------------------------------- */

export interface SupportResult {
  /** Map from "sorted leaf indices" key to support percentage. */
  splits: Map<string, number>
  replicates: number
}

function leafSetKey(node: TreeNode): string {
  const leaves: number[] = []
  const walk = (n: TreeNode) => {
    if (n.children.length === 0) leaves.push(n.leaf ?? 0)
    else n.children.forEach(walk)
  }
  walk(node)
  leaves.sort((a, b) => a - b)
  return leaves.join(',')
}

/** Every internal split of the tree, keyed by its smaller side. */
export function treeSplits(root: TreeNode, n: number): Map<string, TreeNode> {
  const out = new Map<string, TreeNode>()
  const walk = (node: TreeNode) => {
    if (node.children.length === 0) return
    const key = leafSetKey(node)
    const size = key.split(',').length
    const complement = Array.from({ length: n }, (_, i) => i)
      .filter((i) => !key.split(',').includes(String(i)))
      .join(',')
    const canonical = size <= n - size ? key : complement
    if (canonical && size > 1 && size < n) out.set(canonical, node)
    node.children.forEach(walk)
  }
  walk(root)
  return out
}

/**
 * Non-parametric bootstrap over alignment columns.
 * `build` receives a resampled column order and must return a tree.
 */
export function bootstrap(
  n: number,
  columns: number[],
  replicates: number,
  build: (cols: number[]) => TreeNode,
): SupportResult {
  const counts = new Map<string, number>()
  const rng = mulberry32(0x5eed)
  for (let r = 0; r < replicates; r++) {
    const sample = new Array<number>(columns.length)
    for (let i = 0; i < columns.length; i++) {
      sample[i] = columns[Math.floor(rng() * columns.length)]
    }
    const tree = build(sample)
    const seen = new Set<string>()
    for (const [key] of treeSplits(tree, n)) {
      if (seen.has(key)) continue
      seen.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const splits = new Map<string, number>()
  for (const [key, count] of counts) splits.set(key, (count / replicates) * 100)
  return { splits, replicates }
}

export function applySupport(root: TreeNode, n: number, result: SupportResult): void {
  const walk = (node: TreeNode) => {
    if (node.children.length === 0) return
    const key = leafSetKey(node)
    const size = key.split(',').length
    const complement = Array.from({ length: n }, (_, i) => i)
      .filter((i) => !key.split(',').includes(String(i)))
      .join(',')
    const canonical = size <= n - size ? key : complement
    const value = result.splits.get(canonical)
    if (value !== undefined) node.support = value
    node.children.forEach(walk)
  }
  walk(root)
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Positions are produced in *unit* space, not pixels: `radius` is the
 * root-to-node distance divided by the tree's maximum root-to-tip distance
 * (so 0 at the root, 1 at the deepest tip), and `angle`/`row` are pure
 * topology. The view decides how big a unit is, which keeps zoom, export and
 * animation independent of the layout maths.
 */
export interface LaidOutNode {
  id: string
  name?: string
  leaf?: number
  support?: number
  parent?: string
  children: string[]
  /** Root-to-node distance in branch-length units. */
  distance: number
  /** Normalised radius, 0..1. */
  radius: number
  /** Angle in radians (radial mode). */
  angle: number
  /** Leaf row index, 0-based (rectangular mode). */
  row: number
  /** Depth in edges. */
  depth: number
}

export interface Layout {
  nodes: LaidOutNode[]
  byId: Map<string, LaidOutNode>
  leaves: LaidOutNode[]
  /** Max root-to-tip distance in branch-length units. */
  maxDistance: number
  /** Sum of all branch lengths — used for the "tree length" statistic. */
  totalLength: number
  /** Longest root-to-tip path in edges. */
  maxDepth: number
}

export interface LayoutOptions {
  /** Angular gap reserved for labels, radians. */
  gap?: number
}

export function layoutTree(root: TreeNode, opts: LayoutOptions = {}): Layout {
  const gap = opts.gap ?? 0
  const nodes: LaidOutNode[] = []
  const byId = new Map<string, LaidOutNode>()
  const leaves: LaidOutNode[] = []

  let maxDistance = 0
  let totalLength = 0
  let maxDepth = 0
  const measure = (node: TreeNode, d: number, depth: number) => {
    const nd = d + node.length
    totalLength += node.length
    maxDepth = Math.max(maxDepth, depth)
    if (node.children.length === 0) maxDistance = Math.max(maxDistance, nd)
    node.children.forEach((c) => measure(c, nd, depth + 1))
  }
  measure(root, 0, 0)

  // Leaf angles, evenly spaced with a reserved gap for the label fan.
  const leafCount = countLeaves(root)
  let cursor = 0
  const angles = new Map<string, number>()
  const assignAngles = (node: TreeNode) => {
    if (node.children.length === 0) {
      const t = leafCount === 1 ? 0.5 : cursor / (leafCount - 1)
      angles.set(node.id, -Math.PI / 2 + gap / 2 + t * (Math.PI * 2 - gap))
      cursor += 1
      return
    }
    node.children.forEach(assignAngles)
  }
  assignAngles(root)

  let row = 0
  const place = (node: TreeNode, d: number, depth: number, parent?: string): LaidOutNode => {
    const distance = d + node.length
    const isLeaf = node.children.length === 0
    const angle = isLeaf ? (angles.get(node.id) ?? 0) : meanAngle(node.children.map((c) => angleOf(c)))
    const item: LaidOutNode = {
      id: node.id,
      name: node.name,
      leaf: node.leaf,
      support: node.support,
      parent,
      children: [],
      distance,
      radius: maxDistance > 0 ? distance / maxDistance : 0,
      angle,
      row: 0,
      depth,
    }
    nodes.push(item)
    byId.set(item.id, item)
    if (isLeaf) {
      item.row = row++
      leaves.push(item)
      return item
    }
    const kids = node.children.map((c) => place(c, distance, depth + 1, node.id))
    item.children = kids.map((k) => k.id)
    item.row = (kids[0].row + kids[kids.length - 1].row) / 2
    return item
  }

  const angleOf = (node: TreeNode): number => {
    if (node.children.length === 0) return angles.get(node.id) ?? 0
    return meanAngle(node.children.map(angleOf))
  }

  place(root, 0, 0)

  return { nodes, byId, leaves, maxDistance, totalLength, maxDepth }
}

function countLeaves(node: TreeNode): number {
  if (node.children.length === 0) return 1
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0)
}

/** Circular mean, so the 0/2π seam does not average to π. */
function meanAngle(angles: number[]): number {
  let x = 0
  let y = 0
  for (const a of angles) {
    x += Math.cos(a)
    y += Math.sin(a)
  }
  return Math.atan2(y, x)
}

/** Total distance from the root to every leaf (used for the tree length). */
export function tipDistances(root: TreeNode): number[] {
  const out: number[] = []
  const walk = (node: TreeNode, d: number) => {
    const nd = d + node.length
    if (node.children.length === 0) out.push(nd)
    else node.children.forEach((c) => walk(c, nd))
  }
  walk(root, 0)
  return out
}

/** Pairwise distance implied by the tree (patristic distance), for validation. */
export function patristic(root: TreeNode, labels: string[]): Map<string, number> {
  const tipPath = new Map<number, Map<string, number>>()
  const walk = (node: TreeNode, path: Array<[string, number]>) => {
    const next: Array<[string, number]> = [...path, [node.id, node.length]]
    if (node.children.length === 0) {
      const m = new Map<string, number>()
      for (const [id, len] of next) m.set(id, len)
      tipPath.set(node.leaf ?? 0, m)
      return
    }
    node.children.forEach((c) => walk(c, next))
  }
  walk(root, [])
  const out = new Map<string, number>()
  for (const [i, mi] of tipPath) {
    for (const [j, mj] of tipPath) {
      if (j <= i) continue
      let sum = 0
      for (const [id, len] of mi) if (mj.has(id)) sum += len
      out.set(`${labels[i]}|${labels[j]}`, sum)
    }
  }
  return out
}
