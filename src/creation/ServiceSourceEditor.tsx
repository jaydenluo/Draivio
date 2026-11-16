import { ImagePricingEditor } from './ImagePricingEditor'
import { ImageCapabilityEditor } from './ImageCapabilityEditor'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { capabilitiesFor, type ModelCapabilities } from '../ai/providers/modelCapabilities'
import { resolveGenerationOptions, type GenerationOptions } from './generationOptions'
import { imageProtocols, getImageProtocol, switchProtocol, providerProtocols, unsupportedTestMessage, type ImageProtocol } from './imageProtocols'
import { useEffect, useId, useRef, useState } from 'react'
import { SettingsDialog } from '../components/SettingsDialog'
import { fetchConnectionModels, testConnection, validateConnection, type ServiceConnection } from './serviceConnections'
import { updateConnections, useServiceSources } from './modelSources'
import { message, type MessageHandle } from '../ui/message'

export function ServiceSourceEditor({ initialConnection, isExisting, onClose }: { initialConnection: ServiceConnection; isExisting: boolean; onClose: () => void }) {
  const { connections, error, ready } = useServiceSources()
  const [draft, setDraft] = useState<ServiceConnection>(initialConnection)
  const [modelText, setModelText] = useState(initialConnection.models.join(', '))
  const [settingsModel, setSettingsModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const messageKey = useId()
  const feedback = useRef<MessageHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; feedback.current?.close() }
  }, [])

  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [fetched, setFetched] = useState(false)
  useEffect(() => { setAvailableModels([]); setFetched(false); setModelSearch('') }, [draft.baseUrl, draft.apiKey, draft.protocol])
  const selectedModels = [...new Set(modelText.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))]
  const modelChoices = [...new Set([...availableModels, ...selectedModels])]
  const filteredModels = modelChoices.filter(model => model.toLowerCase().includes(modelSearch.trim().toLowerCase()))
  const fetchModels = async () => {
    setBusy(true); feedback.current = message.loading('正在获取模型列表…', { key: messageKey })
    try {
      const models = await fetchConnectionModels({ ...draft, baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim() })
      if (mounted.current) { setAvailableModels(models); setFetched(true); feedback.current?.success(`已获取 ${models.length} 个模型，请勾选后保存`) }
    } catch (reason) { if (mounted.current) feedback.current?.error(reason instanceof Error ? reason.message : '获取模型列表失败') }
    finally { feedback.current = null; if (mounted.current) setBusy(false) }
  }
  const persist = async (next: ServiceConnection[], after?: () => void) => {
    if (error || !ready) { message.error('请先恢复本地配置后重试', { key: messageKey }); return }
    setBusy(true)
    feedback.current = message.loading('正在保存服务来源…', { key: messageKey })
    try { await updateConnections(next); if (mounted.current) { feedback.current?.success('服务来源已保存'); feedback.current = null; after?.() } }
    catch { if (mounted.current) feedback.current?.error('保存失败，请检查本地存储后重试') }
    finally { feedback.current = null; if (mounted.current) setBusy(false) }
  }
  const candidate = () => draft && ({ ...draft, name: draft.name.trim(), baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''), apiKey: draft.apiKey.trim(), models: [...new Set(modelText.split(/[,，\n]/).map((model) => model.trim()).filter(Boolean))], imagePricing: draft.imagePricing ? Object.fromEntries(Object.entries(draft.imagePricing).filter(([model])=>selectedModels.includes(model))) : undefined, imageCapabilities: draft.imageCapabilities ? Object.fromEntries(Object.entries(draft.imageCapabilities).filter(([model]) => selectedModels.includes(model))) : undefined, modelCapabilities: draft.modelCapabilities ? Object.fromEntries(Object.entries(draft.modelCapabilities).filter(([model]) => selectedModels.includes(model))) : undefined, assistantModel: draft.assistantModel && selectedModels.includes(draft.assistantModel) && capabilitiesFor(draft, draft.assistantModel).text ? draft.assistantModel : undefined, modelGeneration: Object.fromEntries(Object.entries(draft.modelGeneration ?? {}).filter(([model]) => modelText.split(/[,，\n]/).map(item => item.trim()).includes(model))) })
  const save = () => {
    const value = candidate()
    if (!value) return
    const invalid = validateConnection(value)
    if (invalid) { message.error(invalid, { key: messageKey }); return }
    void persist(isExisting ? connections.map(item => item.id === value.id ? value : item) : [...connections, value], onClose)
  }
  const test = async () => {
    const value = candidate()
    if (!value) return
    setBusy(true); feedback.current = message.loading('正在测试连接…', { key: messageKey })
    try { const result = await testConnection(value); if (mounted.current) feedback.current?.success(result) }
    catch (reason) { if (mounted.current) feedback.current?.error(reason instanceof Error ? reason.message : '连接失败') }
    finally { feedback.current = null; if (mounted.current) setBusy(false) }
  }
  const generation = draft ? resolveGenerationOptions(draft, settingsModel) : null
  const setGeneration = (patch: Partial<GenerationOptions>) => {
    if (!draft) return
    setDraft(settingsModel ? { ...draft, modelGeneration: { ...draft.modelGeneration, [settingsModel]: { ...draft.modelGeneration?.[settingsModel], ...patch } } } : { ...draft, generation: { ...draft.generation, ...patch } })
  }
  return <SettingsDialog label={isExisting ? '编辑服务来源' : '添加服务来源'} onClose={onClose} className="service-source-editor">
    <DialogTitlebar title={isExisting ? '编辑服务来源' : '添加服务来源'} closeLabel="关闭来源编辑" onClose={onClose} />
      <form onSubmit={(event) => { event.preventDefault(); save() }}><div className="service-editor-scroll"><fieldset disabled={busy}>
        <label>平台<select value={draft.provider} onChange={(event) => { setDraft({ ...switchProtocol(draft, providerProtocols[event.target.value]), provider: event.target.value }) }}>{Object.keys(providerProtocols).map(provider => <option key={provider}>{provider}</option>)}</select></label>
        <label>协议<select value={draft.protocol} onChange={(event) => { setDraft(switchProtocol(draft, event.target.value as ImageProtocol)) }}>{imageProtocols.map(protocol => <option key={protocol.id} value={protocol.id}>{protocol.label}</option>)}</select></label>
        <label>名称<input value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setConfirmDelete(false) }} placeholder="个人 / 工作" /></label>
        <label>地址<input value={draft.baseUrl} onChange={(event) => { setDraft({ ...draft, baseUrl: event.target.value }) }} placeholder="https://…/v1" autoComplete="off" /></label>
        <label>密钥<span className="service-key-field"><input aria-label="密钥" type={showKey ? 'text' : 'password'} value={draft.apiKey} onChange={(event) => { setDraft({ ...draft, apiKey: event.target.value }) }} autoComplete="off" spellCheck={false} /><button type="button" aria-label={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button></span></label>
        <label>模型<input value={modelText} onChange={(event) => setModelText(event.target.value)} placeholder="模型 ID，多个用逗号分隔" /></label>
        <div className="service-model-toolbar"><button type="button" disabled={!getImageProtocol(draft.protocol).listTest} onClick={() => void fetchModels()}>{busy ? '处理中…' : '获取模型列表'}</button><span>已选 {selectedModels.length} 个</span></div>
        {getImageProtocol(draft.protocol).listTest ? <p className="service-storage-note">获取后勾选需要的模型；列表可能包含非生图模型。也可手动填写模型 ID。</p> : <p className="service-storage-note">该协议未提供模型列表接口，请手动填写模型 ID。</p>}
        {modelChoices.length > 0 || fetched ? <div className="service-model-picker">
          <input aria-label="搜索模型" placeholder="搜索模型 ID" value={modelSearch} onChange={event => setModelSearch(event.target.value)} />
          <div className="service-model-toolbar"><button type="button" disabled={!filteredModels.length} onClick={() => setModelText([...new Set([...selectedModels, ...filteredModels])].join(', '))}>全选当前结果</button><button type="button" disabled={!filteredModels.some(model => selectedModels.includes(model))} onClick={() => setModelText(selectedModels.filter(model => !filteredModels.includes(model)).join(', '))}>取消当前结果</button></div>
          <div className="service-model-list" role="group" aria-label="可选模型">{filteredModels.length ? filteredModels.map(model => <label className="service-model-option" key={model}><input type="checkbox" aria-label={`使用模型 ${model}`} checked={selectedModels.includes(model)} onChange={event => setModelText((event.target.checked ? [...selectedModels, model] : selectedModels.filter(item => item !== model)).join(', '))} /><span>{model}</span></label>) : <p className="service-storage-note">{modelSearch ? '没有匹配的模型' : '接口未返回模型，可手动填写模型 ID'}</p>}</div>
        </div> : null}
        <details><summary>模型能力</summary>
          <p className="service-storage-note">按供应商文档声明各模型能力；获取模型列表不会自动启用文本推理或视觉输入。视觉输入指理解图片，图片生成指生成图片。</p>
          {selectedModels.map(model => <fieldset className="service-model-capabilities" key={model}><legend>{model}</legend>{([{ key: 'image', label: '图片生成' }, { key: 'text', label: '文本推理' }, { key: 'vision', label: '视觉输入' }] as { key: keyof ModelCapabilities; label: string }[]).map(({ key, label }) => <label key={key}><input type="checkbox" aria-label={`${model} ${label}`} checked={capabilitiesFor(draft, model)[key]} onChange={event => {
            const capabilities = { ...capabilitiesFor(draft, model), [key]: event.target.checked }
            setDraft({ ...draft, modelCapabilities: { ...draft.modelCapabilities, [model]: capabilities }, assistantModel: draft.assistantModel === model && !capabilities.text ? undefined : draft.assistantModel })
          }} />{label}</label>)}</fieldset>)}
          {!selectedModels.length ? <p>请先填写模型 ID。</p> : null}
        </details>
        <details><summary>图片编辑与蒙版能力</summary>
          <p className="service-storage-note">仅按供应商文档声明。参考图使用 images/edits；蒙版方向必须与端点一致。连接测试和模型列表不证明编辑可用。</p>
          {selectedModels.map(model => <ImageCapabilityEditor key={model} connection={draft} model={model} onChange={capabilities => { const next = {...draft.imageCapabilities}; if(capabilities) next[model]=capabilities; else delete next[model]; setDraft({...draft,imageCapabilities:next}) }}/>) }
        </details>
        <details><summary>图片调用费用估算</summary><p className="service-storage-note">填写已确认的供应商单价。每次调用前将显示模型、请求次数与估算费用；未配置时明确显示费用未知。</p>{selectedModels.map(model=><ImagePricingEditor key={model} model={model} value={draft.imagePricing?.[model]} onChange={value=>{const next={...draft.imagePricing};if(value)next[model]=value;else delete next[model];setDraft({...draft,imagePricing:next})}}/>)}</details>
        <details key={draft.id}><summary>生成设置</summary>
          <label>设置范围<select value={settingsModel} onChange={event => setSettingsModel(event.target.value)}><option value="">来源默认</option>{[...new Set(modelText.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))].map(model => <option key={model} value={model}>{model}{draft.modelGeneration?.[model] ? ' · 已覆盖' : ''}</option>)}</select></label>
          <label>多图方式<select value={generation!.multiImage} onChange={event => setGeneration({ multiImage: event.target.value as GenerationOptions['multiImage'] })}><option value="single">单次多图</option><option value="split">分次生成（每次 1 张）</option></select></label>
          {generation!.multiImage === 'split' ? <label>并发上限<select value={generation!.concurrency} onChange={event => setGeneration({ concurrency: Number(event.target.value) })}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label> : null}
          <label>分辨率参数<select value={generation!.sendSize ? 'send' : 'omit'} onChange={event => setGeneration({ sendSize: event.target.value === 'send' })}><option value="send">发送所选尺寸</option><option value="omit">不发送，由服务决定</option></select></label>
          <label>画质参数<select value={generation!.quality} onChange={event => setGeneration({ quality: event.target.value as GenerationOptions['quality'] })}><option value="omit">不发送</option><option value="auto">自动</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          {settingsModel && draft.modelGeneration?.[settingsModel] ? <button type="button" onClick={() => { const next = { ...draft.modelGeneration }; delete next[settingsModel]; setDraft({ ...draft, modelGeneration: next }) }}>恢复来源默认</button> : null}
          <p className="service-storage-note">OpenAI / 兼容 Images 文生图适用。分次请求默认 1 张，不发送数量参数。</p>
        </details>
        <details><summary>接口说明</summary><p className="service-protocol-info">{getImageProtocol(draft.protocol).auth} · {getImageProtocol(draft.protocol).format}{getImageProtocol(draft.protocol).async ? ' · 异步轮询' : ''}<br />{getImageProtocol(draft.protocol).path}</p>{getImageProtocol(draft.protocol).docs ? <a href={getImageProtocol(draft.protocol).docs} target="_blank" rel="noreferrer">接口文档</a> : null}</details>
        {!getImageProtocol(draft.protocol).listTest ? <p className="service-storage-note">{unsupportedTestMessage}</p> : null}
      </fieldset></div><footer><button type="button" disabled={busy || !getImageProtocol(draft.protocol).listTest} onClick={() => void test()}>测试</button><span />{isExisting ? <button type="button" className="service-delete" onClick={() => confirmDelete ? void persist(connections.filter((item) => item.id !== draft.id), onClose) : setConfirmDelete(true)}>{confirmDelete ? '确认删除' : '删除'}</button> : null}<button type="button" onClick={onClose}>取消</button><button type="submit" disabled={busy}>保存</button></footer>
      </form>
    <p className="service-storage-note">密钥仅保存在本次会话内存，退出应用或刷新后需重新输入；来源配置可保存在本机，密钥不随项目导出。</p>
  </SettingsDialog>
}
