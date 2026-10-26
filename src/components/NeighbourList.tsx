import type { Layout, TreeNode } from '../lib/tree'
import { cladeColor } from '../lib/theme'

interface Props {
  tree: TreeNode
  layout: Layout
  labels: string[]
  taxa: Array<{ name: string; label: string; accession: string }>
  selected: number | null
  onSelect: (leaf: number | null) => void
}

/** The closest relatives of the selected taxon, ordered by tree distance. */
export default function NeighbourList({ tree, layout, labels, taxa, selected, onSelect }: Props) {
  if (selected === null) {
    return (
      <div className="panel-empty">
        <p>点击树上任意一个叶节点，这里会显示它在树上的邻居与分支信息。</p>
      </div>
    )
  }

  const info = describe(tree, layout, labels, selected)
  const taxon = taxa[selected]

  return (
    <div className="neighbour">
      <header className="neighbour-head">
        <span className="eyebrow">已选分类单元</span>
        <h3>{labels[selected]}</h3>
        {taxon && (
          <p className="muted">
            {taxon.label} · <span className="mono">{taxon.accession}</span>
          </p>
        )}
      </header>

      <dl className="kv">
        <div>
          <dt>根到叶距离</dt>
          <dd className="mono">{info.tipDistance.toFixed(4)}</dd>
        </div>
        <div>
          <dt>最近共同祖先</dt>
          <dd className="mono">{info.sisterDistance.toFixed(4)}</dd>
        </div>
        <div>
          <dt>所属分支</dt>
          <dd>
            <span className="swatch" style={{ background: cladeColor(info.clade) }} /> 第 {info.clade + 1} 支
          </dd>
        </div>
      </dl>

      <div className="neighbour-list">
        <span className="eyebrow">树上最近的邻居</span>
        {info.neighbours.map((n) => (
          <button key={n.leaf} className="neighbour-row" onClick={() => onSelect(n.leaf)}>
            <span className="neighbour-name">{labels[n.leaf]}</span>
            <span className="mono neighbour-dist">{n.distance.toFixed(4)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface Info {
  tipDistance: number
  sisterDistance: number
  clade: number
  neighbours: Array<{ leaf: number; distance: number }>
}

/** Path distance from the selected tip to every other tip, via the layout tree. */
function describe(tree: TreeNode, layout: Layout, labels: string[], selected: number): Info {
  const leafNode = layout.leaves.find((l) => l.leaf === selected)
  const tipDistance = leafNode?.distance ?? 0

  const root = layout.nodes.find((n) => !n.parent)
  const cladeIndex = root
    ? root.children.findIndex((id) => {
        const node = layout.byId.get(id)
        if (!node) return false
        return containsLeaf(layout, node.id, selected)
      })
    : 0

  const distances: Array<{ leaf: number; distance: number }> = []
  if (leafNode) {
    const pathToRoot = new Map<string, number>()
    let cur: string | undefined = leafNode.id
    while (cur) {
      const node = layout.byId.get(cur)
      if (!node) break
      pathToRoot.set(cur, node.distance)
      cur = node.parent
    }
    for (const other of layout.leaves) {
      if (other.leaf === selected) continue
      let anc: string | undefined = other.id
      while (anc && !pathToRoot.has(anc)) {
        anc = layout.byId.get(anc)?.parent
      }
      if (!anc) continue
      const lcaDist = pathToRoot.get(anc) ?? 0
      distances.push({ leaf: other.leaf ?? 0, distance: leafNode.distance + other.distance - 2 * lcaDist })
    }
  }
  distances.sort((a, b) => a.distance - b.distance)
  void tree
  void labels

  return {
    tipDistance,
    sisterDistance: distances[0]?.distance ?? 0,
    clade: Math.max(0, cladeIndex),
    neighbours: distances.slice(0, 5),
  }
}

function containsLeaf(layout: Layout, id: string, leaf: number): boolean {
  const node = layout.byId.get(id)
  if (!node) return false
  if (node.leaf === leaf) return true
  return node.children.some((c) => containsLeaf(layout, c, leaf))
}
