import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Controls, { type ControlState } from './components/Controls'
import TreeCanvas from './components/TreeCanvas'
import DistanceMatrix from './components/DistanceMatrix'
import NeighbourList from './components/NeighbourList'
import { datasets, datasetToFasta, getDataset, prettyLabel } from './data'
import type { PipelineOutput } from './lib/pipeline'
import type { WorkerResponse } from './worker/phylo.worker'
import { copyText, downloadSvg, downloadText, toCsv } from './lib/export'
import { GITHUB_URL } from './config'

const DEFAULT_DATASET = 'primates'

function initialState(): ControlState {
  return {
    datasetId: DEFAULT_DATASET,
    fasta: datasetToFasta(getDataset(DEFAULT_DATASET)),
    model: 'p',
    method: 'nj',
    bootstrap: 200,
  }
}

export default function App() {
  const [state, setState] = useState<ControlState>(initialState)
  const [result, setResult] = useState<PipelineOutput | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [mode, setMode] = useState<'radial' | 'rect'>('radial')
  const [tab, setTab] = useState<'tree' | 'matrix' | 'newick'>('tree')
  const [colorByClade, setColorByClade] = useState(true)
  const [showSupport, setShowSupport] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [animateKey, setAnimateKey] = useState(0)

  const workerRef = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const svgHost = useRef<HTMLDivElement>(null)

  const patch = useCallback((p: Partial<ControlState>) => {
    setState((s) => ({ ...s, ...p }))
  }, [])

  const run = useCallback((next: ControlState) => {
    setBusy(true)
    setError(null)
    setProgress(0.02)
    setStage('准备计算')
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./worker/phylo.worker.ts', import.meta.url), {
        type: 'module',
      })
    }
    const worker = workerRef.current
    const id = ++requestId.current
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.id !== id) return
      if (msg.kind === 'progress') {
        setStage(msg.stage)
        setProgress(msg.ratio)
      } else if (msg.kind === 'done') {
        setResult(msg.output)
        setBusy(false)
        setProgress(1)
        setAnimateKey((k) => k + 1)
        setSelected(null)
      } else {
        setError(msg.message)
        setBusy(false)
      }
    }
    worker.postMessage({ id, input: next })
  }, [])

  // Debounced recompute whenever an analysis parameter changes.
  useEffect(() => {
    const timer = setTimeout(() => run(state), 260)
    return () => clearTimeout(timer)
  }, [state.fasta, state.model, state.method, state.bootstrap, run, state])

  useEffect(() => {
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const labels = useMemo(() => (result?.labels ?? []).map(prettyLabel), [result])

  const onExportNewick = () => {
    if (!result) return
    downloadText('tree.nwk', result.newick)
    setToast('已导出 Newick')
  }

  const onExportCsv = () => {
    if (!result) return
    downloadText('distances.csv', toCsv(result.matrix, labels), 'text/csv')
    setToast('已导出距离矩阵 CSV')
  }

  const onExportSvg = () => {
    const svg = svgHost.current?.querySelector('svg')
    if (!svg) return
    const box = svg.viewBox.baseVal
    downloadSvg('tree.svg', svg, box.width, box.height)
    setToast('已导出 SVG')
  }

  const onCopyNewick = async () => {
    if (!result) return
    const ok = await copyText(result.newick)
    setToast(ok ? 'Newick 已复制' : '复制失败，请手动选择')
  }

  const dataset = datasets.find((d) => d.id === state.datasetId)
  const taxa = useMemo(() => dataset?.taxa ?? [], [dataset])

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a className="wordmark" href="#top" aria-label="Phylo Studio 首页">
            <Logo />
            <span>Phylo Studio</span>
          </a>
          <nav className="nav-links" aria-label="主导航">
            <a href="#workbench">工作室</a>
            <a href="#method">方法</a>
            <a href="#data">数据</a>
          </nav>
          <div className="nav-right">
            <a className="icon-btn" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub 仓库">
              <GitHubIcon />
            </a>
            <a className="pill-btn" href="#workbench">
              打开工作室
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-inner">
            <p className="eyebrow reveal">系统发生树 · 浏览器内计算</p>
            <h1 className="reveal delay-1">
              从一段 DNA，
              <br />
              长出一棵树。
            </h1>
            <p className="lede reveal delay-2">
              粘贴 FASTA 序列，Phylo Studio 会在你的浏览器里算出遗传距离、重建系统发生树，
              并把整棵生命之树画成可以漫游、可以追问、可以带走的东西。
            </p>
            <div className="hero-actions reveal delay-3">
              <a className="primary-btn" href="#workbench">
                开始建树
              </a>
              <a className="secondary-btn" href="#method">
                它是怎么算的
              </a>
            </div>
            <p className="hero-foot reveal delay-4">
              无需注册 · 无需上传 · 序列始终留在本机
            </p>
          </div>
          <div className="hero-tree" aria-hidden="true">
            <HeroTree />
          </div>
        </section>

        <section className="workbench" id="workbench">
          <div className="section-head">
            <h2>工作室</h2>
            <p>四个参数，一棵树。所有改动都会在毫秒级内重新计算。</p>
          </div>

          <div className="workbench-card">
            <Controls
              state={state}
              onChange={patch}
              result={result}
              busy={busy}
              stage={stage}
              progress={progress}
              error={error}
            />

            <div className="stage">
              <div className="stage-toolbar">
                <div className="seg seg--small" role="tablist" aria-label="视图">
                  <button
                    role="tab"
                    aria-selected={tab === 'tree'}
                    className={`seg-item${tab === 'tree' ? ' is-on' : ''}`}
                    onClick={() => setTab('tree')}
                  >
                    树
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'matrix'}
                    className={`seg-item${tab === 'matrix' ? ' is-on' : ''}`}
                    onClick={() => setTab('matrix')}
                  >
                    距离矩阵
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'newick'}
                    className={`seg-item${tab === 'newick' ? ' is-on' : ''}`}
                    onClick={() => setTab('newick')}
                  >
                    Newick
                  </button>
                </div>

                <div className="toolbar-right">
                  {tab === 'tree' && (
                    <>
                      <div className="seg seg--small" role="radiogroup" aria-label="布局">
                        <button
                          role="radio"
                          aria-checked={mode === 'radial'}
                          className={`seg-item${mode === 'radial' ? ' is-on' : ''}`}
                          onClick={() => setMode('radial')}
                        >
                          径向
                        </button>
                        <button
                          role="radio"
                          aria-checked={mode === 'rect'}
                          className={`seg-item${mode === 'rect' ? ' is-on' : ''}`}
                          onClick={() => setMode('rect')}
                        >
                          矩形
                        </button>
                      </div>
                      <Toggle label="按分支着色" on={colorByClade} onChange={setColorByClade} />
                      <Toggle label="支持率" on={showSupport} onChange={setShowSupport} />
                    </>
                  )}
                  <div className="menu-wrap">
                    <button className="ghost-btn" onClick={onExportSvg} disabled={!result}>
                      导出 SVG
                    </button>
                    <button className="ghost-btn" onClick={onExportNewick} disabled={!result}>
                      Newick
                    </button>
                    <button className="ghost-btn" onClick={onExportCsv} disabled={!result}>
                      CSV
                    </button>
                  </div>
                </div>
              </div>

              <div className="stage-body" ref={svgHost}>
                {tab === 'tree' && result && (
                  <TreeCanvas
                    layout={result.layout}
                    labels={labels}
                    mode={mode}
                    colorByClade={colorByClade}
                    showSupport={showSupport}
                    selected={selected}
                    onSelect={setSelected}
                    hovered={hovered}
                    onHover={setHovered}
                    animateKey={animateKey}
                  />
                )}
                {tab === 'matrix' && result && (
                  <DistanceMatrix
                    matrix={result.matrix}
                    labels={labels}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
                {tab === 'newick' && result && (
                  <div className="newick-view">
                    <div className="newick-head">
                      <span className="eyebrow">Newick 格式</span>
                      <button className="ghost-btn" onClick={onCopyNewick}>
                        复制
                      </button>
                    </div>
                    <pre className="newick-pre">{formatNewick(result.newick)}</pre>
                  </div>
                )}
                {!result && !busy && <div className="stage-placeholder">等待序列…</div>}
                {busy && !result && (
                  <div className="stage-loading">
                    <span className="spinner" />
                    <p>{stage}</p>
                  </div>
                )}
              </div>

              <aside className="stage-aside">
                <NeighbourList
                  tree={result?.tree ?? ({} as never)}
                  layout={result?.layout ?? ({ nodes: [], byId: new Map(), leaves: [], maxDistance: 0, totalLength: 0, maxDepth: 0 } as never)}
                  labels={labels}
                  taxa={taxa}
                  selected={selected}
                  onSelect={setSelected}
                />
                {result && (
                  <dl className="aside-stats">
                    <div>
                      <dt>Bootstrap</dt>
                      <dd className="mono">{result.stats.replicates || '—'}</dd>
                    </div>
                    <div>
                      <dt>饱和位点对</dt>
                      <dd className="mono">{result.stats.saturated}</dd>
                    </div>
                    <div>
                      <dt>比对</dt>
                      <dd>{result.stats.aligned ? '按列直接比较' : '逐对全局比对'}</dd>
                    </div>
                  </dl>
                )}
              </aside>
            </div>
          </div>
        </section>

        <section className="method" id="method">
          <div className="section-head">
            <h2>它是怎么算的</h2>
            <p>四步，每一步都可以在源码里找到对应的实现。</p>
          </div>
          <div className="cards">
            <Card step="01" title="解析与比对">
              容忍 FASTA、纯文本、行号与模糊碱基。等长序列直接按列比较；长度不同时先用 Needleman–Wunsch
              做逐对全局比对，空位记为未知位点，不参与距离计算。
            </Card>
            <Card step="02" title="遗传距离">
              p-distance 是差异位点的直接比例；Jukes–Cantor 与 Kimura 2P 校正多重替换，后者还区分转换与颠换。
              出现饱和时会被标记出来，而不是悄悄给出一个假的数字。
            </Card>
            <Card step="03" title="聚类建树">
              Neighbor-Joining 逐步合并使总枝长最小的类群，不假设分子钟；UPGMA 用平均连接，假设所有谱系速率相同。
              两者都输出带枝长的二叉树。
            </Card>
            <Card step="04" title="Bootstrap">
              对列做有放回重采样，重复建树，统计每个分支在多少比例的重采样里重新出现。支持率画在内部节点上，
              低于 100 才标注。
            </Card>
          </div>
          <div className="method-note">
            <h3>关于「准确性」的诚实说明</h3>
            <p>
              这里实现的是教学与研究常用的经典算法，不是完整的系统发生推断套件：没有最大似然、没有贝叶斯、
              没有分区模型、没有 gamma 速率异质性。它足够把一个概念讲清楚，也足够对真实序列给出一个合理的初步结构；
              但它不能替代 IQ-TREE、RAxML 或 MrBayes 在发表级分析中的位置。
            </p>
          </div>
        </section>

        <section className="data" id="data">
          <div className="section-head">
            <h2>数据与边界</h2>
            <p>示例数据是真实序列；算法是经典实现；解释权留给你。</p>
          </div>
          <div className="data-grid">
            <div className="data-card">
              <h3>示例序列</h3>
              <p>
                脊椎动物与灵长类两组示例，均取自 NCBI RefSeq 线粒体基因组的 COX1（COI）编码区，
                截取 5′ 端 648 bp —— 也就是 DNA 条形码常用的那段。每个叶节点的学名与登录号都能在矩阵面板里核对。
              </p>
              <ul className="data-list">
                {datasets.map((d) => (
                  <li key={d.id}>
                    <span>{d.name}</span>
                    <span className="mono muted">{d.taxa.length} taxa · {d.taxa[0].seq.length} bp</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="data-card">
              <h3>隐私</h3>
              <p>
                没有后端。序列进入 Web Worker，在内存里完成比对、距离与建树，页面关闭即消失。
                项目本身是纯静态站点，部署在 GitHub Pages 上，只提供 HTML、CSS、JavaScript 与那份示例数据。
              </p>
            </div>
            <div className="data-card">
              <h3>开源</h3>
              <p>
                算法、组件与测试都在同一个仓库里，MIT 许可。你可以把它嵌进自己的课堂材料、改一套配色、
                或者只拿走那个把树画出来的 SVG 布局函数。
              </p>
              <a className="link-arrow" href={GITHUB_URL} target="_blank" rel="noreferrer">
                在 GitHub 上查看 →
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <span className="wordmark wordmark--footer">
              <Logo />
              <span>Phylo Studio</span>
            </span>
            <p className="muted">在浏览器里重建系统发生树。</p>
          </div>
          <div className="footer-links">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="#method">方法</a>
            <a href="#data">数据</a>
            <span className="muted">MIT License</span>
          </div>
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

/**
 * Pretty-print a Newick string: one clade per line, indented by nesting depth.
 * Only commas at parenthesis depth ≥ 1 break lines, so quoted labels and
 * branch lengths survive untouched.
 */
function formatNewick(text: string): string {
  let out = ''
  let depth = 0
  let inQuote = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === "'") {
      // A doubled quote inside a quoted label is an escaped quote, not a close.
      if (inQuote && text[i + 1] === "'") {
        out += "''"
        i += 1
        continue
      }
      inQuote = !inQuote
      out += ch
      continue
    }
    if (inQuote) {
      out += ch
      continue
    }
    if (ch === '(') {
      depth += 1
      out += ch
      continue
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      out += ch
      continue
    }
    if (ch === ',' && depth > 0) {
      out += ',\n' + '  '.repeat(depth)
      continue
    }
    out += ch
  }
  return out
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle${on ? ' is-on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-label">{label}</span>
    </button>
  )
}

function Card({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <article className="card">
      <span className="card-step mono">{step}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <g stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M32 54V38" />
        <path d="M32 38c0-9-12-10-12-17" />
        <path d="M32 38c0-9 12-10 12-17" />
      </g>
      <circle cx="20" cy="21" r="3.6" fill="#0a84ff" />
      <circle cx="44" cy="21" r="3.6" fill="#30d158" />
      <circle cx="32" cy="54" r="3.6" fill="#ff9f0a" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/** Decorative hero tree: fixed geometry, drawn once, animated by CSS. */
function HeroTree() {
  const branches = [
    'M300 400 V300',
    'M300 300 C300 210 190 205 190 130',
    'M300 300 C300 210 410 205 410 130',
    'M190 130 C190 95 140 92 140 60',
    'M190 130 C190 95 240 92 240 60',
    'M410 130 C410 95 360 92 360 60',
    'M410 130 C410 95 460 92 460 60',
  ]
  return (
    <svg viewBox="0 0 600 480" className="hero-svg">
      <defs>
        <radialGradient id="hg" cx="50%" cy="82%" r="60%">
          <stop offset="0%" stopColor="rgba(10,132,255,0.30)" />
          <stop offset="100%" stopColor="rgba(10,132,255,0)" />
        </radialGradient>
      </defs>
      <ellipse cx="300" cy="400" rx="290" ry="200" fill="url(#hg)" />
      <g fill="none" stroke="rgba(245,245,247,0.55)" strokeWidth="1.6" strokeLinecap="round">
        {branches.map((d, i) => (
          <path key={d} d={d} pathLength={1} className="hero-branch" style={{ animationDelay: `${i * 140}ms` }} />
        ))}
      </g>
      <g>
        {[
          [140, 60, '#0a84ff'],
          [240, 60, '#0a84ff'],
          [360, 60, '#30d158'],
          [460, 60, '#30d158'],
          [300, 400, '#f5f5f7'],
        ].map(([cx, cy, fill], i) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx as number}
            cy={cy as number}
            r={4}
            fill={fill as string}
            className="hero-tip"
            style={{ animationDelay: `${600 + i * 90}ms` }}
          />
        ))}
      </g>
    </svg>
  )
}
