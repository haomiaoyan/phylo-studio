/// <reference lib="webworker" />
import { runPipeline, type PipelineInput, type PipelineOutput } from '../lib/pipeline'

export type WorkerRequest = { id: number; input: PipelineInput }

export type WorkerResponse =
  | { id: number; kind: 'progress'; stage: string; ratio: number }
  | { id: number; kind: 'done'; output: PipelineOutput }
  | { id: number; kind: 'error'; message: string }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, input } = event.data
  try {
    const output = runPipeline(input, (stage, ratio) => {
      ;(self as DedicatedWorkerGlobalScope).postMessage({
        id,
        kind: 'progress',
        stage,
        ratio,
      } satisfies WorkerResponse)
    })
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, kind: 'done', output } satisfies WorkerResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, kind: 'error', message } satisfies WorkerResponse)
  }
}
