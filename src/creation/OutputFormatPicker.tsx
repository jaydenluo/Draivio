import { useEffect, useRef, useState } from 'react'
import { outputFormats, type OutputRatio } from './outputFormats'

type Props = {
  ratio: string
  size: string
  onChoose: (ratio: OutputRatio, size: string) => void
  onClose: () => void
}

export function OutputFormatPicker({ ratio, size, onChoose, onClose }: Props) {
  const [activeRatio, setActiveRatio] = useState(ratio === 'auto' ? '1:1' : ratio)
  const root = useRef<HTMLDivElement>(null)
  const preset = outputFormats.find((format) => format.ratio === activeRatio) ?? outputFormats[0]

  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
  }, [])

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && !root.current?.contains(target) && !target.closest('[aria-controls="output-format-popover"]')) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      document.querySelector<HTMLButtonElement>('[aria-controls="output-format-popover"]')?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  return <div ref={root} id="output-format-popover" className="output-format-popover" role="dialog" aria-label="比例与分辨率">
    <div className="output-format-heading"><strong>比例与分辨率</strong><button type="button" aria-label="关闭比例与分辨率" onClick={onClose}>×</button></div>
    <button type="button" className={`output-format-auto ${ratio === 'auto' ? 'selected' : ''}`} aria-label="Auto 自动比例与分辨率" aria-pressed={ratio === 'auto'} onClick={() => onChoose('auto', 'auto')}><span>Auto</span><small>自动比例与分辨率</small></button>
    <div className="output-format-columns">
      <div className="output-ratios" role="group" aria-label="常用比例"><span className="output-format-caption">比例</span>{outputFormats.map((format) => {
        const [width, height] = format.ratio.split(':').map(Number)
        return <button key={format.ratio} type="button" className={preset.ratio === format.ratio ? 'selected' : ''} aria-label={`比例 ${format.ratio}`} aria-pressed={preset.ratio === format.ratio} onClick={() => setActiveRatio(format.ratio)}><span className="output-ratio-icon" aria-hidden="true" style={{ width: width >= height ? 18 : 18 * width / height, height: height >= width ? 18 : 18 * height / width }} /><span>{format.ratio}</span></button>
      })}</div>
      <div className="output-resolutions" role="group" aria-label={`${preset.ratio} 分辨率`}><span className="output-format-caption">{preset.ratio} · {preset.name}</span><button type="button" className={ratio === preset.ratio && size === 'auto' ? 'selected' : ''} aria-label="Auto 自动分辨率" aria-pressed={ratio === preset.ratio && size === 'auto'} onClick={() => onChoose(preset.ratio, 'auto')}><span>Auto</span><small>自动分辨率</small></button>{preset.sizes.map((resolution) => <button key={resolution} type="button" className={ratio === preset.ratio && size === resolution ? 'selected' : ''} aria-pressed={ratio === preset.ratio && size === resolution} onClick={() => onChoose(preset.ratio, resolution)}>{resolution}</button>)}<p>结果将使用所选比例和分辨率</p></div>
    </div>
  </div>
}
