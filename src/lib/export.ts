export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSvg(filename: string, svg: SVGSVGElement, width: number, height: number): void {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  // Inline background so the exported file is readable outside the app.
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('width', '100%')
  rect.setAttribute('height', '100%')
  rect.setAttribute('fill', '#08080c')
  clone.insertBefore(rect, clone.firstChild)
  const xml = new XMLSerializer().serializeToString(clone)
  downloadText(filename, `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, 'image/svg+xml')
}

export function toCsv(matrix: number[][], labels: string[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const head = ['', ...labels.map(esc)].join(',')
  const rows = matrix.map((row, i) => [esc(labels[i]), ...row.map((v) => v.toFixed(6))].join(','))
  return [head, ...rows].join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
