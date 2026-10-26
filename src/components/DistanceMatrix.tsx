import { useEffect, useMemo, useRef, useState } from 'react'
import { heatColor, readableOn } from '../lib/theme'

interface Props {
  matrix: number[][]
  labels: string[]
  selected: number | null
  onSelect: (leaf: number | null) => void
}

const GAP = 2
const MIN_CELL = 22
const MAX_CELL = 64

export default function DistanceMatrix({ matrix, labels, selected, onSelect }: Props) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null)
  const [width, setWidth] = useState(0)
  const hostRef = useRef<HTMLDivElement>(null)

  // Cells are sized from the real container width so the matrix always fits
  // without clipping on narrow screens.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const read = () => setWidth(el.clientWidth)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = useMemo(() => {
    let m = 0
    for (const row of matrix) for (const v of row) if (v > m) m = v
    return m || 1
  }, [matrix])

  const n = labels.length
  const labelW = Math.round(Math.min(168, Math.max(84, width * 0.22)))
  const available = Math.max(0, width - labelW - 44 - n * GAP)
  const cell = Math.round(Math.min(MAX_CELL, Math.max(MIN_CELL, available / Math.max(1, n))))

  return (
    <div className="matrix-scroll" ref={hostRef}>
      <div className="matrix-inner">
        <div className="matrix-head">
          <span className="matrix-title">成对遗传距离</span>
          <span className="matrix-legend">
            <span className="mono">0</span>
            <span className="legend-ramp" />
            <span className="mono">{max.toFixed(3)}</span>
          </span>
        </div>
        <div
          className="matrix-grid"
          style={{ gridTemplateColumns: `${labelW}px repeat(${n}, ${cell}px)`, gap: GAP }}
        >
          <div />
          {labels.map((l, j) => (
            <div
              key={`h-${j}`}
              className={`matrix-col-label${selected === j ? ' is-on' : ''}`}
              title={l}
              style={{ height: 84 }}
            >
              <span>{l}</span>
            </div>
          ))}
          {labels.map((rowLabel, i) => (
            <Row
              key={`r-${i}`}
              rowIndex={i}
              rowLabel={rowLabel}
              row={matrix[i]}
              labels={labels}
              max={max}
              cell={cell}
              labelW={labelW}
              hover={hover}
              setHover={setHover}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Row(props: {
  rowIndex: number
  rowLabel: string
  row: number[]
  labels: string[]
  max: number
  cell: number
  labelW: number
  hover: { i: number; j: number } | null
  setHover: (h: { i: number; j: number } | null) => void
  selected: number | null
  onSelect: (leaf: number | null) => void
}) {
  const { rowIndex, rowLabel, row, labels, max, cell, hover, setHover, selected, onSelect } = props
  return (
    <>
      <div
        className={`matrix-row-label${selected === rowIndex ? ' is-on' : ''}`}
        title={rowLabel}
        style={{ height: cell, width: props.labelW }}
      >
        <span>{rowLabel}</span>
      </div>
      {row.map((value, j) => {
        const t = rowIndex === j ? 0 : value / max
        const active = hover && ((hover.i === rowIndex && hover.j === j) || (hover.j === rowIndex && hover.i === j))
        return (
          <button
            key={`c-${rowIndex}-${j}`}
            className={`matrix-cell${rowIndex === j ? ' is-diag' : ''}${active ? ' is-hover' : ''}${
              selected === j || selected === rowIndex ? ' is-line' : ''
            }`}
            style={{
              height: cell,
              fontSize: Math.max(8.5, Math.min(12.5, cell * 0.24)),
              background: rowIndex === j ? 'transparent' : heatColor(t),
              color: readableOn(heatColor(t)),
            }}
            onMouseEnter={() => setHover({ i: rowIndex, j })}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(selected === j ? null : j)}
            aria-label={`${rowLabel} 与 ${labels[j]} 的距离 ${value.toFixed(4)}`}
            tabIndex={-1}
          >
            {rowIndex === j ? '' : value < 0.001 ? '0' : value.toFixed(2).slice(1)}
          </button>
        )
      })}
    </>
  )
}
