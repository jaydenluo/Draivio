import type { Selection } from './selectionGeometry'

/** Providers receive local image data only when the user explicitly invokes a cloud tool. */
export type CanvasCloudServices = {
  selectSubject?: (image: string) => Promise<Selection>
  heal?: (image: string, region: Selection) => Promise<string>
}
let services: CanvasCloudServices = {}
export function configureCanvasCloudServices(next: CanvasCloudServices) { services = { ...next } }
export function canvasCloudServices() { return services }
