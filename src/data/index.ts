import raw from './datasets.json'

export interface DatasetTaxon {
  name: string
  label: string
  accession: string
  seq: string
}

export interface Dataset {
  id: string
  name: string
  source: string
  retrieved: string
  gene: string
  taxa: DatasetTaxon[]
}

const datasets = (raw as { datasets: Dataset[] }).datasets

export { datasets }

export function getDataset(id: string): Dataset {
  return datasets.find((d) => d.id === id) ?? datasets[0]
}

export function datasetToFasta(dataset: Dataset): string {
  // Underscored binomials keep every taxon unique in the FASTA name slot (and
  // stay Newick-safe); the UI swaps the underscores back for display.
  return dataset.taxa
    .map((t) => `>${t.name.replace(/\s+/g, '_')} | ${t.label}\n${t.seq.match(/.{1,70}/g)?.join('\n') ?? t.seq}`)
    .join('\n')
}

/** `Homo_sapiens` → `Homo sapiens` for anything the visitor reads. */
export function prettyLabel(name: string): string {
  return name.replace(/_/g, ' ')
}
