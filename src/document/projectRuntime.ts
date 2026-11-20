import { ImageAssetClient } from '../assets/imageAssetClient'
import {
  collectRasterReferences,
  imageAssetStore,
} from '../assets/imageAssetStore'
import type { ImageAsset } from '../assets/imageAssetTypes'
import type { ProjectDocument } from './projectFormat'
/** Each open document owns fresh native leases. URLs stay in the resolver and
 * never enter a project, history snapshot, or saved fingerprint. */
export async function openProjectPreviews(
  document: ProjectDocument,
  owner: string,
  signal?: AbortSignal,
  onReleaseReady?:(release:()=>Promise<void>)=>void,
): Promise<() => Promise<void>> {
  const client = new ImageAssetClient(),
    assets: ImageAsset[] = []
  const disposed=new Set<ImageAsset>()
  const release = async () => {
    imageAssetStore.releaseOwner(owner)
    let first: unknown
    for (const asset of assets) {
      if(disposed.has(asset))continue
      try {
        await client.dispose(asset)
        disposed.add(asset)
      } catch (error) {
        first ??= error
      }
    }
    if (first) throw first
  }
  onReleaseReady?.(release)
  try {
    for (const reference of collectRasterReferences(document)) {
      if (signal?.aborted) throw new Error('项目打开已取消')
      const asset = await client.reopen(reference)
      assets.push(asset)
      const started = await client.start(asset, 'preview', { maxEdge: 2048 })
      const ready = await client.wait(asset, started.jobId, { signal })
      if (!ready.resource || ready.resource.coordinateSpace !== 'display')
        throw new Error('项目预览生成失败；原件已保留')
      imageAssetStore.publishPreview(
        reference,
        ready.resource.resourceUrl,
        owner,
      )
    }
    if (signal?.aborted) throw new Error('项目打开已取消')
    return release
  } catch (error) {
    // The workspace received the cleanup handle before the first asynchronous
    // operation and retains it in its module-owned retry queue on any failure.
    if(!onReleaseReady)await release()
    throw error
  }
}
