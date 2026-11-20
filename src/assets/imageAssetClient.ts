import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ImageAsset, ImageAssetError, ImageAssetInvoke, ImageAssetJob, ImageAssetOperation, RasterReference } from './imageAssetTypes';
import {validateRasterReference} from './imageAssetStore';
export class ImageAssetServiceError extends Error {
  readonly code: string;
  constructor(error: ImageAssetError) { super(error.message); this.name = 'ImageAssetServiceError'; this.code = error.code; }
}
function failure(code: string): ImageAssetServiceError { return new ImageAssetServiceError({ code, message: code }); }
function structured(error: unknown): ImageAssetServiceError {
  if (error instanceof ImageAssetServiceError) return error;
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return new ImageAssetServiceError({ code: error.code, message: 'message' in error && typeof error.message === 'string' ? error.message : error.code });
  }
  return failure('transport_failed');
}
/** Thin capability client. No HTML File path guessing or browser decode fallback. */
export class ImageAssetClient {
  private readonly invoke: ImageAssetInvoke;
  private readonly available: () => boolean;
  private readonly leases = new Map<string, string>();
  private readonly disposing = new Map<string, string>();
  constructor(options: { invoke?: ImageAssetInvoke; available?: () => boolean } = {}) {
    this.invoke = options.invoke ?? invoke; this.available = options.available ?? isTauri;
  }
  private async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (!this.available()) throw failure('runtime_unavailable');
    try { return await this.invoke(command, args) as T; } catch (error) { throw structured(error); }
  }
  private active(asset: ImageAsset): void {
    if (this.leases.get(asset.assetId) !== asset.lease) throw failure('lease_expired');
  }
  private args(asset: ImageAsset): Record<string, unknown> {
    this.active(asset); return { assetId: asset.assetId, revision: asset.revision, lease: asset.lease };
  }
  private checkedJob(asset: ImageAsset, job: ImageAssetJob): ImageAssetJob {
    this.active(asset);
    if (job.protocolVersion !== 1 || job.assetId !== asset.assetId || job.revision !== asset.revision) throw failure('revision_stale');
    if (job.resource && (job.resource.assetId !== asset.assetId || job.resource.revision !== asset.revision || job.resource.session !== asset.session)) throw failure('revision_stale');
    return job;
  }
  async pick(): Promise<ImageAsset | null> {
    const asset = await this.call<ImageAsset | null>('image_asset_pick');
    if (asset) { if (asset.protocolVersion !== 1) throw failure('protocol_version'); this.leases.set(asset.assetId, asset.lease); }
    return asset;
  }
  async reopen(reference: RasterReference): Promise<ImageAsset> {
    validateRasterReference(reference);
    const asset=await this.call<ImageAsset>('image_resource_reopen',{reference});
    if(asset.protocolVersion!==1 || asset.rasterRef?.assetId!==reference.assetId || asset.rasterRef?.revision!==reference.revision)throw failure('revision_stale');
    this.leases.set(asset.assetId,asset.lease);
    return asset;
  }
  async snapshot(asset: ImageAsset): Promise<ImageAsset> {
    const result = await this.call<ImageAsset>('image_asset_snapshot', this.args(asset)); this.active(asset);
    if (result.assetId !== asset.assetId || result.revision !== asset.revision || result.lease !== asset.lease) throw failure('revision_stale');
    return result;
  }
  async start(asset: ImageAsset, operation: ImageAssetOperation, options: { maxEdge?: number; timeoutMs?: number } = {}): Promise<ImageAssetJob> {
    const maxEdge = options.maxEdge ?? 1024, timeoutMs = options.timeoutMs ?? 120000;
    if (!['preview', 'cache', 'original'].includes(operation) || !Number.isInteger(maxEdge) || maxEdge < 1 || maxEdge > 4096 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw failure('invalid_request');
    const job = await this.call<ImageAssetJob>('image_asset_start', { ...this.args(asset), operation, maxEdge, timeoutMs });
    return this.checkedJob(asset, job);
  }
  async status(asset: ImageAsset, jobId: string): Promise<ImageAssetJob> {
    const job = await this.call<ImageAssetJob>('image_asset_job', { ...this.args(asset), jobId }); return this.checkedJob(asset, job);
  }
  async cancel(asset: ImageAsset, jobId: string): Promise<void> { await this.call('image_asset_cancel', { ...this.args(asset), jobId }); }
  async dispose(asset: ImageAsset): Promise<void> {
    if (this.disposing.get(asset.assetId) !== asset.lease) this.active(asset);
    this.leases.delete(asset.assetId); this.disposing.set(asset.assetId, asset.lease);
    try { await this.call('image_asset_dispose', { assetId: asset.assetId, lease: asset.lease }); }
    catch (error) { if (!(error instanceof ImageAssetServiceError) || error.code !== 'lease_expired') throw error; }
    this.disposing.delete(asset.assetId);
  }
  async wait(asset: ImageAsset, jobId: string, options: { signal?: AbortSignal; pollMs?: number } = {}): Promise<ImageAssetJob> {
    const pollMs = options.pollMs ?? 100;
    if (!Number.isInteger(pollMs) || pollMs < 10 || pollMs > 5000) throw failure('invalid_request');
    for (;;) {
      if (options.signal?.aborted) { await this.cancel(asset, jobId); throw failure('cancelled'); }
      const job = await this.status(asset, jobId);
      if (options.signal?.aborted) { await this.cancel(asset, jobId); throw failure('cancelled'); }
      if (job.phase === 'ready') return job;
      if (job.phase !== 'queued' && job.phase !== 'running') throw new ImageAssetServiceError(job.error ?? { code: job.phase, message: job.phase });
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, pollMs); options.signal?.addEventListener('abort', done, { once: true });
      });
    }
  }
}
