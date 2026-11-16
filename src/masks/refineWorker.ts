import { refineMaskAlpha } from './refineMask'

type WorkerScope = { onmessage: (event: MessageEvent) => void; postMessage: (value: unknown, transfer?: Transferable[]) => void }
const workerScope = self as unknown as WorkerScope
workerScope.onmessage = (event: MessageEvent<{ input: Uint8Array; width: number; height: number; params: Parameters<typeof refineMaskAlpha>[3] }>) => {
  const { input, width, height, params } = event.data
  const result = refineMaskAlpha(input, width, height, params)
  workerScope.postMessage(result, [result.buffer] as unknown as Transferable[])
}
