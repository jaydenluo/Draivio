export type TileKey = { assetId: string; revision: number; cacheVersion: number; level: number; x: number; y: number };
export type TileResponse = TileKey & { width: number; height: number; tileSize: number; sampleType: 'u8'; bands: 4; bytes: number[]; ready: boolean };
