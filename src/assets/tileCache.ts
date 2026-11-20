import { invoke, isTauri } from '@tauri-apps/api/core';
import type { TileKey, TileResponse } from './tileTypes';

export type TileInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
/** Typed source-pixel tile reader. Display transforms never enter the tile key. */
export class TileCacheClient {
  private readonly invoke: TileInvoke;
  private readonly available: () => boolean;
  constructor(options: { invoke?: TileInvoke; available?: () => boolean } = {}) {
    this.invoke = options.invoke ?? invoke; this.available = options.available ?? isTauri;
  }
  async read(key: TileKey, lease: string): Promise<TileResponse> {
    if (!this.available()) throw new Error('runtime_unavailable');
    if (!Number.isInteger(key.revision) || key.revision < 0 || !Number.isInteger(key.level) || key.level < 0 || key.x < 0 || key.y < 0) throw new Error('invalid_tile');
    const value = await this.invoke('image_asset_tile', { ...key, lease });
    if (!value || typeof value !== 'object') throw new Error('worker_protocol');
    const result = value as TileResponse;
    if (result.assetId !== key.assetId || result.revision !== key.revision || result.level !== key.level || result.x !== key.x || result.y !== key.y || result.sampleType !== 'u8' || result.bands !== 4 || !result.ready || !Array.isArray(result.bytes)) throw new Error('worker_protocol');
    return result;
  }
}
