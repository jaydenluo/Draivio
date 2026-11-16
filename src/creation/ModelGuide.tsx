import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import guide from './imageModelGuide.json'

const sections = [
  { id: 'models', label: '模型怎么选' },
  { id: 'parameters', label: '强度与参数' },
  { id: 'tips', label: '使用建议' },
] as const

type Section = typeof sections[number]['id']
type Model = typeof guide.models[number]

function ModelCard({ model }: { model: Model }) {
  return <article className="model-guide-card">
    <div className="model-guide-provider">{model.platform}</div>
    <h3>{model.name}</h3>
    <p className="model-guide-focus">{model.focus}</p>
    <p>{model.features}</p>
    <dl><dt>适合做什么</dt><dd>{model.bestFor}</dd><dt>选择前留意</dt><dd>{model.limits}</dd><dt>关于强度</dt><dd>{model.strength}</dd></dl>
    <div className="model-guide-sources">{model.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span aria-hidden="true"> ↗</span></a>)}</div>
  </article>
}

export function ModelGuide({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('models')
  const dialog = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (event.key === 'Tab') {
        const items = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href], summary, [tabindex="0"]')
        if (!items?.length) return
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey, true)
      previouslyFocused?.focus()
    }
  }, [onClose])

  const chooseSection = (next: Section) => {
    setSection(next)
    if (content.current) content.current.scrollTop = 0
  }

  return createPortal(<div className="model-guide-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} className="model-guide" role="dialog" aria-modal="true" aria-labelledby="model-guide-title" aria-describedby="model-guide-intro" onKeyDown={(event) => event.stopPropagation()}>
      <header className="model-guide-header"><div><span className="model-guide-eyebrow">DRAIVIO · 创作参考</span><h2 id="model-guide-title">图片模型与参数指南</h2></div><button type="button" className="model-guide-close" aria-label="关闭模型指南" onClick={onClose}>×</button></header>
      <p id="model-guide-intro" className="model-guide-intro">{guide.intro}</p>
      <div className="model-guide-tabs" role="tablist" aria-label="指南章节">{sections.map((item, index) => <button key={item.id} type="button" id={`model-guide-tab-${item.id}`} role="tab" aria-selected={section === item.id} aria-controls={`model-guide-panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} onClick={() => chooseSection(item.id)} onKeyDown={(event) => {
        const nextIndex = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null
        if (nextIndex === null) return
        event.preventDefault()
        chooseSection(sections[nextIndex].id)
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus()
      }}>{item.label}</button>)}</div>
      <div ref={content} className="model-guide-content" role="tabpanel" id={`model-guide-panel-${section}`} aria-labelledby={`model-guide-tab-${section}`} tabIndex={0}>
        {section === 'models' ? <>
          <div className="model-guide-note">{guide.availability}</div>
          <h3 className="model-guide-section-title">已核查官方资料的代表模型</h3>
          <div className="model-guide-grid">{guide.models.filter((model) => model.verified).map((model) => <ModelCard key={model.id} model={model} />)}</div>
          <h3 className="model-guide-section-title">其他候选 · 当前版本与参数待核实</h3>
          <p className="model-guide-muted">以下官方页面本次访问受限，保留评测方向与官方入口，不给出当前最新版本、价格或参数保证。</p>
          <div className="model-guide-grid">{guide.models.filter((model) => !model.verified).map((model) => <ModelCard key={model.id} model={model} />)}</div>
        </> : section === 'parameters' ? <>
          <article className="model-guide-strength"><span className="model-guide-eyebrow">先理解变化程度</span><h3>{guide.strength.title}</h3><p>{guide.strength.summary}</p><p>{guide.strength.example}</p><p>{guide.strength.difference}</p><p>{guide.strength.support}</p><p className="model-guide-note">{guide.strength.demo}</p></article>
          <h3 className="model-guide-section-title">已核查的模型参数示例</h3>
          <div className="model-guide-grid">{guide.parameterExamples.map((item) => <article className="model-guide-card" key={item.name}><h3>{item.name}</h3><p>{item.meaning}</p><div className="model-guide-sources"><a href={item.url} target="_blank" rel="noopener noreferrer">官方参数文档 ↗</a></div></article>)}</div>
          <div className="model-guide-parameter-list">{guide.parameters.map((item) => <article key={item.name}><h3>{item.name}</h3><p>{item.meaning}</p></article>)}</div>
        </> : <>
          <h3 className="model-guide-section-title">把目标说清楚，比盲目拉高参数更有效</h3>
          <ul className="model-guide-tips">{guide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          <div className="model-guide-parameter-list">{guide.parameters.filter((item) => ['数量与批量请求', '质量、速度与费用'].includes(item.name)).map((item) => <article key={item.name}><h3>{item.name}</h3><p>{item.meaning}</p></article>)}</div>
        </>}
      </div>
      <footer className="model-guide-footer"><span>资料核查：{guide.updatedAt} · 能力随版本与平台变化</span><span>官方链接在新窗口打开</span></footer>
    </div>
  </div>, document.body)
}
