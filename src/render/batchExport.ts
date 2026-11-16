export type BatchExportResult<T> = { id: string; status: 'succeeded' | 'failed' | 'cancelled'; value?: T; error?: string }
export async function exportBatch<I extends { id: string }, O>(items: I[], exporter: (item: I, signal: AbortSignal) => Promise<O>, concurrency = 2, signal: AbortSignal = new AbortController().signal): Promise<BatchExportResult<O>[]> {
  const results: BatchExportResult<O>[] = items.map(item => ({ id: item.id, status: 'cancelled' }))
  let cursor = 0
  const worker = async () => { while (true) { if (signal.aborted) return; const index = cursor++; if (index >= items.length) return; const item = items[index]; try { results[index] = { id: item.id, status: 'succeeded', value: await exporter(item, signal) } } catch (error) { results[index] = signal.aborted ? { id: item.id, status: 'cancelled' } : { id: item.id, status: 'failed', error: error instanceof Error ? error.message : '导出失败' } } } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, worker))
  return results
}
