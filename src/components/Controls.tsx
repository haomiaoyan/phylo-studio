import { useEffect, useRef, useState } from 'react'
import type { PipelineOutput } from '../lib/pipeline'
import type { Model } from '../lib/distance'
import type { Method } from '../lib/tree'
import { datasets, datasetToFasta } from '../data'

export interface ControlState {
  datasetId: string
  fasta: string
  model: Model
  method: Method
  bootstrap: number
}

interface Props {
  state: ControlState
  onChange: (patch: Partial<ControlState>) => void
  result: PipelineOutput | null
  busy: boolean
  stage: string
  progress: number
  error: string | null
}

const MODELS: Array<{ id: Model; name: string; note: string }> = [
  { id: 'p', name: 'p-distance', note: '差异位点比例，最直观' },
  { id: 'jc', name: 'Jukes–Cantor', note: '校正多重替换' },
  { id: 'k2p', name: 'Kimura 2P', note: '区分转换与颠换' },
]

const METHODS: Array<{ id: Method; name: string; note: string }> = [
  { id: 'nj', name: 'Neighbor-Joining', note: '不假设分子钟，序列分析首选' },
  { id: 'upgma', name: 'UPGMA', note: '平均连接，假设速率恒定' },
]

export default function Controls({ state, onChange, result, busy, stage, progress, error }: Props) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const dataset = datasets.find((d) => d.id === state.datasetId)
  const taxa = result?.stats.taxa ?? 0
  const sites = result?.stats.sites ?? 0

  const loadDataset = (id: string) => {
    const ds = datasets.find((d) => d.id === id) ?? datasets[0]
    onChange({ datasetId: id, fasta: datasetToFasta(ds) })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    onChange({ datasetId: 'custom', fasta: text })
  }

  const pasteRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (open) pasteRef.current?.focus()
  }, [open])

  return (
    <div className="controls">
      <div className="controls-head">
        <div className="seg seg--wide" role="tablist" aria-label="示例数据集">
          {datasets.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={state.datasetId === d.id}
              className={`seg-item${state.datasetId === d.id ? ' is-on' : ''}`}
              onClick={() => loadDataset(d.id)}
            >
              {d.name.split(' · ')[0]}
            </button>
          ))}
          <button
            role="tab"
            aria-selected={state.datasetId === 'custom'}
            className={`seg-item${state.datasetId === 'custom' ? ' is-on' : ''}`}
            onClick={() => setOpen(true)}
          >
            自定义
          </button>
        </div>
        <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
          导入 FASTA
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".fasta,.fa,.fna,.txt,.fas"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <span className="field-label">距离模型</span>
          <div className="seg" role="radiogroup" aria-label="距离模型">
            {MODELS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={state.model === m.id}
                className={`seg-item${state.model === m.id ? ' is-on' : ''}`}
                title={m.note}
                onClick={() => onChange({ model: m.id })}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">建树算法</span>
          <div className="seg" role="radiogroup" aria-label="建树算法">
            {METHODS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={state.method === m.id}
                className={`seg-item${state.method === m.id ? ' is-on' : ''}`}
                title={m.note}
                onClick={() => onChange({ method: m.id })}
              >
                {m.id === 'nj' ? 'NJ' : 'UPGMA'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            Bootstrap <em className="mono">{state.bootstrap === 0 ? '关' : state.bootstrap}</em>
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            step={100}
            value={state.bootstrap}
            onChange={(e) => onChange({ bootstrap: Number(e.target.value) })}
            aria-label="Bootstrap 重复次数"
          />
        </div>
      </div>

      <div className="stats-strip">
        <Stat label="分类单元" value={String(taxa)} />
        <Stat label="比对位点" value={sites ? `${sites} bp` : '—'} />
        <Stat label="平均距离" value={result ? result.stats.meanDistance.toFixed(4) : '—'} />
        <Stat label="树长" value={result ? result.stats.totalLength.toFixed(3) : '—'} />
        <Stat label="耗时" value={result ? `${result.stats.elapsedMs.toFixed(0)} ms` : '—'} />
      </div>

      {busy && (
        <div className="progress" role="status" aria-live="polite">
          <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          <span className="progress-text">{stage}</span>
        </div>
      )}
      {error && <div className="alert alert--error">{error}</div>}
      {result && result.warnings.length > 0 && !busy && (
        <ul className="alerts">
          {result.warnings.map((w) => (
            <li key={w} className="alert alert--warn">
              {w}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="粘贴序列">
            <div className="sheet-head">
              <h3>粘贴 FASTA 序列</h3>
              <button className="ghost-btn" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>
            <p className="sheet-note">
              至少 2 条序列。等长序列直接按列比较；长度不同会自动做逐对全局比对（Needleman–Wunsch）。
            </p>
            <textarea
              ref={pasteRef}
              className="paste"
              value={state.fasta}
              spellCheck={false}
              onChange={(e) => onChange({ fasta: e.target.value, datasetId: 'custom' })}
              placeholder={'>Homo sapiens\nACGTACGT...\n>Pan troglodytes\nACGTACGA...'}
            />
            <div className="sheet-foot">
              <span className="muted mono">{state.fasta.length} 字符</span>
              <button className="primary-btn" onClick={() => setOpen(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {dataset && (
        <p className="source-line">
          数据来源：{dataset.source}（{dataset.retrieved}，NCBI RefSeq）。全部计算在本地浏览器完成，序列不会上传。
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value mono">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
