import { processRaster, type ProcessingOptions } from './processingScheduler'
import type { RasterWorkerRequest } from '../../engine/raster/rasterWorker'

// Dedicated module Worker. Importing rasterWorker.ts for its type does not
// install the legacy classic-worker handler in the browser's main window.
self.onmessage = async (event: MessageEvent<{ request: RasterWorkerRequest; options: Pick<ProcessingOptions, 'chunkRows' | 'maxPixels' | 'maxBytes'> }>) => {
 try {
  const result = await processRaster(event.data.request, { ...event.data.options, execution: 'cooperative', onProgress: progress => self.postMessage({ progress }) })
  self.postMessage({ result }, { transfer: [result.image.data.buffer] })
 } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '栅格任务失败' }) }
}
