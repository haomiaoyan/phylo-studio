import { alignPair, distanceMatrix, encode, type Model } from './distance'
import { parseSequences, type SeqRecord } from './fasta'
import {
  applySupport,
  bootstrap,
  buildTree,
  layoutTree,
  resetIds,
  toNewick,
  type Layout,
  type Method,
  type TreeNode,
} from './tree'

export interface PipelineInput {
  fasta: string
  model: Model
  method: Method
  bootstrap: number
}

export interface PipelineOutput {
  records: SeqRecord[]
  labels: string[]
  matrix: number[][]
  tree: TreeNode
  layout: Layout
  newick: string
  stats: {
    taxa: number
    sites: number
    aligned: boolean
    meanDistance: number
    minDistance: number
    maxDistance: number
    saturated: number
    totalLength: number
    replicates: number
    elapsedMs: number
  }
  warnings: string[]
}

export type Progress = (stage: string, ratio: number) => void

/**
 * The whole analysis: parse → (align) → distances → tree → layout.
 * Pure and synchronous; the worker wrapper is what keeps the UI responsive.
 */
export function runPipeline(input: PipelineInput, onProgress: Progress = () => {}): PipelineOutput {
  const started = performance.now()
  const { records, warnings } = parseSequences(input.fasta)
  if (records.length < 2) {
    throw new Error(records.length === 0 ? '没有解析到任何序列。' : '至少需要 2 条序列才能建树。')
  }
  if (records.length > 200) {
    throw new Error(`一次最多 200 条序列（当前 ${records.length} 条）。`)
  }

  onProgress('整理序列', 0.05)
  const lengths = new Set(records.map((r) => r.seq.length))
  const aligned = lengths.size === 1
  let sequences: string[]

  if (aligned) {
    sequences = records.map((r) => r.seq)
  } else {
    // Unequal input: progressively align each sequence against the first.
    const ref = records[0].seq
    sequences = [ref]
    for (let i = 1; i < records.length; i++) {
      const { a, b } = alignPair(sequences[i - 1], records[i].seq)
      sequences[i - 1] = a
      sequences.push(b)
      onProgress('逐对全局比对', 0.05 + (0.45 * i) / records.length)
    }
  }

  const width = Math.min(...sequences.map((s) => s.length))
  const columns = Array.from({ length: width }, (_, i) => i)
  const codes = sequences.map(encode)

  onProgress('计算遗传距离', 0.55)
  const dm = distanceMatrix(codes, input.model)
  const flat = dm.matrix.flat().filter((_, i) => i % (records.length + 1) !== 0)

  resetIds()
  const build = (cols: number[]) => {
    const d = cols === columns ? dm.matrix : distanceMatrix(codes, input.model, cols).matrix
    return buildTree(d, input.method)
  }

  onProgress('构建系统发生树', 0.7)
  const tree = buildTree(dm.matrix, input.method)

  let replicates = 0
  if (input.bootstrap > 0 && records.length >= 4) {
    onProgress('Bootstrap 重采样', 0.8)
    const support = bootstrap(records.length, columns, input.bootstrap, (cols) => build(cols))
    applySupport(tree, records.length, support)
    replicates = support.replicates
  }

  onProgress('计算布局', 0.95)
  const layout = layoutTree(tree, { gap: 0.55 })
  const labels = records.map((r) => r.name)
  const newick = toNewick(tree, labels)

  return {
    records,
    labels,
    matrix: dm.matrix,
    tree,
    layout,
    newick,
    stats: {
      taxa: records.length,
      sites: width,
      aligned,
      meanDistance: dm.meanDistance,
      minDistance: flat.length ? Math.min(...flat) : 0,
      maxDistance: flat.length ? Math.max(...flat) : 0,
      saturated: dm.saturated,
      totalLength: layout.totalLength,
      replicates,
      elapsedMs: performance.now() - started,
    },
    warnings,
  }
}
