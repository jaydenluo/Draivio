import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RecipeWorkspace } from '../ai/recipes/RecipeWorkspace'
import { PosterRecipeWorkspace } from '../ai/recipes/PosterRecipeWorkspace'
import { PortraitRecipeWorkspace } from '../ai/recipes/PortraitRecipeWorkspace'
import { RecipeBatchWorkspace } from '../ai/batch/RecipeBatchWorkspace'
import { ProductRecipeWorkspace } from '../ai/recipes/ProductRecipeWorkspace'
import { DoubleExposureWorkspace } from '../ai/recipes/DoubleExposureWorkspace'
import { RelightWorkspace } from '../ai/workflows/RelightWorkspace'
import { OcrWorkspace } from '../ai/vision/OcrWorkspace'
import { FloatingSurface } from '../ui/FloatingSurface'
import './creativeTools.css'

export function CreativeTools({ onClose }: { onClose: () => void }) {
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => { content.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true }) }, [])

  return createPortal(
    <FloatingSurface title="创作工具" onClose={onClose} role="dialog" aria-label="创作工具" aria-modal="false" tabIndex={-1} className="creative-tools-panel">
      <div ref={content} className="creative-tools-body">
        <p className="creative-tools-intro">按需要展开工具，预览确认后应用到作品。</p>
        <section className="creative-tools-group" aria-label="排版与识字">
          <h3>排版与识字</h3>
          <PosterRecipeWorkspace />
          <OcrWorkspace />
        </section>
        <section className="creative-tools-group" aria-label="图像修饰">
          <h3>图像修饰</h3>
          <PortraitRecipeWorkspace />
          <ProductRecipeWorkspace />
          <DoubleExposureWorkspace />
          <RelightWorkspace />
        </section>
        <section className="creative-tools-group" aria-label="配方与批处理">
          <h3>配方与批处理</h3>
          <RecipeWorkspace />
          <RecipeBatchWorkspace />
        </section>
      </div>
    </FloatingSurface>, document.body,
  )
}
