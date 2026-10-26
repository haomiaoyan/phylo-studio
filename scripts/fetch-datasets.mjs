/**
 * Regenerate the bundled demo datasets from real NCBI data.
 *
 * Fetches the COX1 (COI) coding sequence of each mitochondrial RefSeq genome
 * through NCBI E-utilities and writes the first 648 nt — the classic Folmer
 * barcode window — into src/data/datasets.json.
 *
 * usage: node scripts/fetch-datasets.mjs
 *
 * Note: `curl -k` is used because some corporate/hosted environments carry a
 * TLS-intercepting proxy whose certificate Node does not trust. If your network
 * verifies normally, plain `fetch` works just as well.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = resolve(here, '../src/data/datasets.json')

const TARGET_LEN = 648 // classic Folmer barcode region, multiple of 3

function curl(url) {
  return execFileSync('curl', ['-sk', '--max-time', '60', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function efetchCds(accession) {
  const url =
    'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=' +
    encodeURIComponent(accession) +
    '&rettype=fasta_cds_na&retmode=text'
  return curl(url)
}

function parseFasta(text) {
  const records = []
  let cur = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('>')) {
      if (cur) records.push(cur)
      cur = { header: line.slice(1), seq: '' }
    } else if (cur) {
      cur.seq += line.toUpperCase().replace(/[^ACGTN]/g, '')
    }
  }
  if (cur) records.push(cur)
  return records
}

function pickCox1(text) {
  const recs = parseFasta(text)
  const cox1 = recs.find((r) => /\[gene=COX1\]/i.test(r.header) || /\[gene=COI\]/i.test(r.header))
  if (!cox1) return null
  const gene = (cox1.header.match(/\[gene=([^\]]+)\]/) || [])[1] || 'COX1'
  return { seq: cox1.seq.slice(0, TARGET_LEN), gene, header: cox1.header }
}

const VERTEBRATES = [
  ['Homo sapiens', 'NC_012920.1', '人'],
  ['Pan troglodytes', 'NC_001643.1', '黑猩猩'],
  ['Gorilla gorilla', 'NC_011120.1', '大猩猩'],
  ['Pongo abelii', 'NC_002083.1', '苏门答腊猩猩'],
  ['Macaca mulatta', 'NC_005943.1', '恒河猴'],
  ['Mus musculus', 'NC_005089.1', '小鼠'],
  ['Rattus norvegicus', 'NC_001665.2', '褐家鼠'],
  ['Bos taurus', 'NC_006853.1', '牛'],
  ['Canis lupus familiaris', 'NC_002008.4', '家犬'],
  ['Gallus gallus', 'NC_001323.1', '鸡'],
  ['Danio rerio', 'NC_002333.2', '斑马鱼'],
  ['Xenopus laevis', 'NC_001573.1', '非洲爪蟾'],
  ['Drosophila melanogaster', 'NC_024511.2', '黑腹果蝇'],
  ['Apis mellifera', 'NC_001566.1', '意大利蜜蜂'],
  ['Caenorhabditis elegans', 'NC_001328.1', '秀丽隐杆线虫'],
  ['Arabidopsis thaliana', 'NC_037304.1', '拟南芥'],
]

const PRIMATES = [
  ['Homo sapiens', 'NC_012920.1', '人'],
  ['Pan troglodytes', 'NC_001643.1', '黑猩猩'],
  ['Pan paniscus', 'NC_001644.1', '倭黑猩猩'],
  ['Gorilla gorilla', 'NC_011120.1', '大猩猩'],
  ['Pongo abelii', 'NC_002083.1', '苏门答腊猩猩'],
  ['Hylobates lar', 'NC_002082.1', '白掌长臂猿'],
  ['Macaca mulatta', 'NC_005943.1', '恒河猴'],
  ['Papio hamadryas', 'NC_001992.1', '阿拉伯狒狒'],
  ['Lemur catta', 'NC_004025.1', '环尾狐猴'],
]

async function buildSet(name, label, species) {
  const taxa = []
  for (const [sci, acc, zh] of species) {
    let picked = null
    for (let attempt = 0; attempt < 3 && !picked; attempt++) {
      try {
        const text = efetchCds(acc)
        picked = pickCox1(text)
        if (!picked) console.warn(`  ! no COX1 CDS in ${acc}`)
      } catch (err) {
        console.warn(`  ! ${acc} attempt ${attempt + 1}: ${err.message}`)
      }
    }
    if (!picked) continue
    console.log(`  ${sci.padEnd(28)} ${acc.padEnd(14)} ${picked.seq.length} nt`)
    taxa.push({ name: sci, label: zh, accession: acc, seq: picked.seq })
  }
  return {
    id: name,
    name: label,
    source: 'NCBI RefSeq mitochondrion, COX1 (COI) CDS, first 648 nt',
    retrieved: new Date().toISOString().slice(0, 10),
    gene: 'COX1',
    taxa,
  }
}

const datasets = []
console.log('vertebrates…')
datasets.push(await buildSet('vertebrates', '脊椎动物 · COI 条形码', VERTEBRATES))
console.log('primates…')
datasets.push(await buildSet('primates', '灵长类 · COI 条形码', PRIMATES))

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify({ datasets }, null, 1) + '\n')
console.log(`\nwrote ${outFile}`)
