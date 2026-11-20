/** Native image service v1. All dimensions are raw source coordinates except
 * display previews; runtime resources and leases are session-local and must not enter
 * document JSON or undo history. rasterRef is the separate durable identity. Strong source identity is SHA-256 after copy. */
export type ImageSampleType = 'u8' | 'u16' | 'f32' | 'unsupported';
export type ImageAssetOperation = 'preview' | 'cache' | 'original';
export type ImageJobPhase = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'timed_out' | 'unavailable';
export interface ImageAssetError { code: string; message: string }
export interface ImageAssetMetadata {
  width: number; height: number; bands: number; sampleType: ImageSampleType;
  orientation: number; pages: number; format: 'jpeg' | 'png' | 'tiff';
  editingSupported: boolean; profileHash: string | null;
}
export interface ImageAssetResource {
  resourceId: string; session: string; assetId: string; revision: number;
  role: 'profile' | ImageAssetOperation; mime: string; bytes: number;
  width: number | null; height: number | null; coordinateSpace: 'source' | 'display' | null;
  /** Provided by Tauri for the current WebView platform; never reconstruct it. */
  resourceUrl: string; displayTransformHash: string | null;
}
export interface ImageAsset {
  protocolVersion: 1; assetId: string; session: string; revision: number; lease: string;
  rasterRef?: RasterReference | null; metadata: ImageAssetMetadata; contentHash: string | null; profile: ImageAssetResource | null;
}
export interface ImageAssetJob {
  protocolVersion: 1; jobId: string; assetId: string; revision: number; phase: ImageJobPhase;
  resource: ImageAssetResource | null; contentHash: string | null; error: ImageAssetError | null;
}
export type ImageAssetInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Durable artwork identity. Session capabilities and display URLs are excluded. */
export interface RasterReference { assetId: string; revision: number }
export interface ImageResourceRoot { kind: 'document' | 'project' | 'undo' | 'redo' | 'recovery' | 'transaction'; id: string }
