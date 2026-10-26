import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Layout } from '../lib/tree'
import { cladeColor } from '../lib/theme'

export interface TreeCanvasProps {
  layout: Layout
  labels: string[]
  mode: 'radial' | 'rect'
  colorByClade: boolean
  showSupport: boolean
  selected: number | null
  onSelect: (leaf: number | null) => void
  animateKey: number
  hovered: number | null
  onHover: (leaf: number | null) => void
}

interface Point {
  x: number
  y: number
}

/** Horizontal room reserved for leaf labels in radial mode (px, adaptive). */
const labelRoom = (labels: string[]) => {
  const longest = labels.reduce((max, l) => Math.max(max, l.length), 6)
  return Math.min(230, 26 + longest * 6.4)
}
/** Labels pointing straight up or down need vertical room along the radius. */
const VERTICAL_LABEL_ROOM = 118
/** Shallow tips get their label pulled out to this fraction of the radius. */
const LABEL_RING = 0.72
const RECT_LEFT = 62
const RECT_RIGHT = 210
const RECT_TOP = 34
const ROW_H = 30
/** Below this the layout stops shrinking and the wrap scrolls instead. */
const MIN_SIZE = { w: 320, h: 320 }

export default function TreeCanvas(props: TreeCanvasProps) {
  const { layout, labels, mode, colorByClade, showSupport, selected, onSelect, animateKey } = props
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [size, setSize] = useState({ w: 880, h: 560 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Track the real box so the SVG viewBox can be expressed in CSS pixels:
  // one SVG unit === one pixel keeps strokes, labels and hit targets crisp.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const read = () => {
      const w = Math.max(MIN_SIZE.w, Math.round(el.clientWidth))
      const h = Math.max(MIN_SIZE.h, Math.round(el.clientHeight))
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])

  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [animateKey, mode])

  const cladeOf = useMemo(() => {
    const map = new Map<number, number>()
    const root = layout.nodes.find((n) => !n.parent)
    if (!root) return map
    root.children.forEach((id, index) => {
      const walk = (nodeId: string) => {
        const node = layout.byId.get(nodeId)
        if (!node) return
        if (node.leaf !== undefined) map.set(node.leaf, index)
        node.children.forEach(walk)
      }
      walk(id)
    })
    return map
  }, [layout])

  const activeLeaf = props.hovered ?? selected

  const activePath = useMemo(() => {
    const set = new Set<string>()
    if (activeLeaf === null || activeLeaf === undefined) return set
    const leaf = layout.leaves.find((l) => l.leaf === activeLeaf)
    if (!leaf) return set
    let cur: string | undefined = leaf.id
    while (cur) {
      set.add(cur)
      cur = layout.byId.get(cur)?.parent
    }
    return set
  }, [activeLeaf, layout])

  // Rectangular mode spreads its leaves over the available height instead of
  // stacking them at the top, so short trees stay optically centred.
  const leafCount = layout.leaves.length
  const rowGap =
    mode === 'rect' && leafCount > 1
      ? Math.max(ROW_H, Math.min(64, (size.h - RECT_TOP * 2) / (leafCount - 1)))
      : ROW_H
  const rowsH = Math.max(0, (leafCount - 1) * rowGap)
  const vbW = size.w
  const vbH = mode === 'radial' ? size.h : Math.max(size.h, rowsH + RECT_TOP * 2)
  const rectTop = mode === 'radial' ? RECT_TOP : Math.max(RECT_TOP, (vbH - rowsH) / 2)

  const cx = vbW / 2
  const cy = vbH / 2
  // Radial crown radius: reserve horizontal room for the longest label and the
  // same kind of room vertically, because a label pointing straight up/down
  // extends along the radius instead of sideways.
  const room = labelRoom(labels)
  const radialR = Math.max(96, Math.min(vbW / 2 - room, vbH / 2 - Math.min(room, VERTICAL_LABEL_ROOM)))

  const pos = useCallback(
    (node: { radius: number; angle: number; row: number }): Point => {
      if (mode === 'radial') {
        const r = node.radius * radialR
        return { x: cx + Math.cos(node.angle) * r, y: cy + Math.sin(node.angle) * r }
      }
      return {
        x: RECT_LEFT + node.radius * Math.max(80, vbW - RECT_LEFT - RECT_RIGHT),
        y: rectTop + node.row * rowGap,
      }
    },
    [mode, cx, cy, radialR, vbW, rectTop, rowGap],
  )

  const edges = useMemo(() => {
    const out: Array<{ key: string; d: string; depth: number; parentId: string; childId: string; leaf?: number }> = []
    for (const node of layout.nodes) {
      if (!node.parent) continue
      const parent = layout.byId.get(node.parent)
      if (!parent) continue
      const p = pos(parent)
      const c = pos(node)
      let d: string
      if (mode === 'radial') {
        const r0 = parent.radius * radialR
        const a0 = parent.angle
        const a1 = node.angle
        const p0 = { x: cx + Math.cos(a0) * r0, y: cy + Math.sin(a0) * r0 }
        const p1 = { x: cx + Math.cos(a1) * r0, y: cy + Math.sin(a1) * r0 }
        const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
        const sweep = a1 > a0 ? 1 : 0
        if (r0 < 0.01) {
          d = `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}L${c.x.toFixed(2)} ${c.y.toFixed(2)}`
        } else {
          d = `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}L${c.x.toFixed(2)} ${c.y.toFixed(2)}`
        }
      } else {
        d = `M${p.x.toFixed(2)} ${p.y.toFixed(2)}L${c.x.toFixed(2)} ${p.y.toFixed(2)}L${c.x.toFixed(2)} ${c.y.toFixed(2)}`
      }
      out.push({ key: node.id, d, depth: node.depth, parentId: parent.id, childId: node.id, leaf: node.leaf })
    }
    return out
  }, [layout, mode, pos, cx, cy, radialR])

  const strokeFor = useCallback(
    (childId: string, leaf?: number) => {
      if (!colorByClade) return 'var(--tree-line)'
      if (leaf !== undefined) return cladeColor(cladeOf.get(leaf) ?? 0)
      const node = layout.byId.get(childId)
      if (!node) return 'var(--tree-line)'
      // Colour an internal branch by the clade of its first descendant leaf.
      let cur = node
      while (cur.children.length > 0) {
        const next = layout.byId.get(cur.children[0])
        if (!next) break
        cur = next
      }
      return cladeColor(cladeOf.get(cur.leaf ?? 0) ?? 0)
    },
    [cladeOf, colorByClade, layout],
  )

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.0015)
    setScale((s) => Math.min(6, Math.max(0.55, s * factor)))
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest('[data-leaf]')) return
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    setOffset({ x: drag.current.ox + dx, y: drag.current.oy + dy })
  }

  const endDrag = () => {
    drag.current = null
  }

  const supportNodes = layout.nodes.filter((n) => n.children.length > 0 && n.support !== undefined)

  // Zoom about the crown centre rather than the SVG origin.
  const zoomX = offset.x + cx * (1 - scale)
  const zoomY = offset.y + cy * (1 - scale)

  return (
    <div className={`tree-wrap tree-wrap--${mode}`} ref={wrapRef}>
      <svg
        className={`tree-svg tree-svg--${mode}`}
        width={vbW}
        height={vbH}
        viewBox={`0 0 ${vbW} ${vbH}`}
        role="img"
        aria-label={`系统发生树，共 ${layout.leaves.length} 个分类单元`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClick={(e) => {
          if (!(e.target as Element).closest('[data-leaf]')) onSelect(null)
        }}
      >
        <g transform={`translate(${zoomX.toFixed(2)} ${zoomY.toFixed(2)}) scale(${scale})`}>
          {mode === 'radial' && (
            <g className="tree-rings" aria-hidden="true">
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <circle key={t} cx={cx} cy={cy} r={radialR * t} className="ring" />
              ))}
            </g>
          )}

          <g className="tree-branches">
            {edges.map((edge) => {
              const isActive = activePath.has(edge.childId)
              return (
                <path
                  key={`${animateKey}-${edge.key}`}
                  d={edge.d}
                  pathLength={1}
                  className={`branch${isActive ? ' branch--active' : ''}${selected !== null && !isActive ? ' branch--dim' : ''}`}
                  style={{
                    stroke: isActive ? 'var(--tree-accent)' : strokeFor(edge.childId, edge.leaf),
                    animationDelay: `${Math.min(28, edge.depth) * 55}ms`,
                  }}
                />
              )
            })}
          </g>

          {showSupport && (
            <g className="tree-support">
              {supportNodes.map((node) => {
                const p = pos(node)
                const text = Math.round(node.support ?? 0)
                return (
                  <g key={`s-${node.id}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                    <rect x={-12} y={-8} width={24} height={15} rx={4} className="support-bg" />
                    <text textAnchor="middle" dy={3.5} className="support-text">
                      {text}
                    </text>
                  </g>
                )
              })}
            </g>
          )}

          <g className="tree-leaves">
            {layout.leaves.map((leaf) => {
              const p = pos(leaf)
              const index = leaf.leaf ?? 0
              const color = colorByClade ? cladeColor(cladeOf.get(index) ?? 0) : 'var(--tree-accent)'
              const isSelected = selected === index
              const deg = (leaf.angle * 180) / Math.PI
              const flip = mode === 'radial' && Math.cos(leaf.angle) < 0
              // Tips that sit close to the root would otherwise stack their
              // labels on top of each other, so shallow labels are pulled out
              // to a comfortable ring and joined to their tip by a leader.
              const tipR = leaf.radius * radialR
              const ringR = radialR * LABEL_RING
              const labelR = mode === 'radial' ? Math.max(tipR, ringR) : tipR
              const lx = mode === 'radial' ? cx + Math.cos(leaf.angle) * (labelR + 11) : p.x + 11
              const ly = mode === 'radial' ? cy + Math.sin(leaf.angle) * (labelR + 11) : p.y
              const leader = mode === 'radial' && labelR - tipR > 36
              return (
                <g
                  key={`leaf-${leaf.id}-${animateKey}`}
                  data-leaf={index}
                  className={`leaf${isSelected ? ' leaf--selected' : ''}`}
                  style={{ animationDelay: `${Math.min(28, leaf.depth) * 55 + 120}ms` }}
                  onMouseEnter={() => props.onHover(index)}
                  onMouseLeave={() => props.onHover(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(isSelected ? null : index)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(isSelected ? null : index)
                    }
                  }}
                  aria-label={labels[index]}
                >
                  {leader && (
                    <line
                      className="leaf-leader"
                      x1={p.x}
                      y1={p.y}
                      x2={cx + Math.cos(leaf.angle) * labelR}
                      y2={cy + Math.sin(leaf.angle) * labelR}
                      stroke={color}
                    />
                  )}
                  <text
                    className="leaf-label"
                    x={lx}
                    y={ly}
                    dy={4}
                    textAnchor={flip ? 'end' : 'start'}
                    transform={mode === 'radial' ? `rotate(${flip ? deg + 180 : deg} ${lx} ${ly})` : undefined}
                  >
                    {labels[index]}
                  </text>
                  <circle cx={p.x} cy={p.y} r={isSelected ? 6 : 3.4} fill={color} className="leaf-dot" />
                  {isSelected && <circle cx={p.x} cy={p.y} r={11} className="leaf-halo" />}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      <div className="tree-hint" aria-hidden="true">
        滚轮缩放 · 拖拽平移 · 点击叶节点
      </div>
      {scale !== 1 && (
        <button
          className="tree-reset"
          onClick={() => {
            setScale(1)
            setOffset({ x: 0, y: 0 })
          }}
        >
          复位
        </button>
      )}
    </div>
  )
}
