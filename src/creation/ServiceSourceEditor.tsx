import { Checkbox } from '../ui/Checkbox'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { capabilitiesFor } from '../ai/providers/modelCapabilities'
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
        {getImageProtocol(draft.protocol).listTest ? <p className="service-storage-note">获取后勾选需要的模型，常见型号自动区分推理与图片；未分类型号请指定用途。也可手动填写模型 ID。</p> : <p className="service-storage-note">该协议未提供模型列表接口，请手动填写模型 ID。</p>}
        {modelChoices.length > 0 || fetched ? <div className="service-model-picker">
          <input aria-label="搜索模型" placeholder="搜索模型 ID" value={modelSearch} onChange={event => setModelSearch(event.target.value)} />
          <div className="service-model-toolbar"><button type="button" disabled={!filteredModels.length} onClick={() => setModelText([...new Set([...selectedModels, ...filteredModels])].join(', '))}>全选当前结果</button><button type="button" disabled={!filteredModels.some(model => selectedModels.includes(model))} onClick={() => setModelText(selectedModels.filter(model => !filteredModels.includes(model)).join(', '))}>取消当前结果</button></div>
          <div className="service-model-list" role="group" aria-label="可选模型">{filteredModels.length ? filteredModels.map(model => {
            const capability = capabilitiesFor(draft, model)
            const enabled = selectedModels.includes(model)
            const textProtocol = ['openai_compatible', 'volcengine'].includes(draft.protocol)
            return <div className="service-model-row" key={model}>
              <label className="service-model-option"><Checkbox aria-label={`使用模型 ${model}`} checked={enabled} onChange={event => setModelText((event.target.checked ? [...selectedModels, model] : selectedModels.filter(item => item !== model)).join(', '))} /><span title={model}>{model}</span></label>
              {enabled && textProtocol ? <div className="service-model-usage">
                <select aria-label={`${model} 用途`} value={capability.text ? capability.image ? 'both' : 'text' : capability.image ? 'image' : 'unknown'} onChange={event => {
                  const text = ['text', 'both'].includes(event.target.value)
                  setDraft({ ...draft, modelCapabilities: { ...draft.modelCapabilities, [model]: { image: ['image', 'both'].includes(event.target.value), text, vision: text && capability.vision } } })
                }}><option value="unknown">未分类</option><option value="image">图片</option><option value="text">推理</option><option value="both">图片与推理</option></select>
                {capability.text ? <label className="service-model-vision"><Checkbox aria-label={`${model} 支持看图`} checked={capability.vision} onChange={event => setDraft({ ...draft, modelCapabilities: { ...draft.modelCapabilities, [model]: { ...capability, vision: event.target.checked } } })} />支持看图</label> : null}
              </div> : null}
            </div>
          }) : <p className="service-storage-note">{modelSearch ? '没有匹配的模型' : '接口未返回模型，可手动填写模型 ID'}</p>}</div>
        </div> : null}
        {!getImageProtocol(draft.protocol).listTest ? <p className="service-storage-note">{unsupportedTestMessage}</p> : null}
      </fieldset></div><footer><button type="button" disabled={busy || !getImageProtocol(draft.protocol).listTest} onClick={() => void test()}>测试</button><span />{isExisting ? <button type="button" className="service-delete" onClick={() => confirmDelete ? void persist(connections.filter((item) => item.id !== draft.id), onClose) : setConfirmDelete(true)}>{confirmDelete ? '确认删除' : '删除'}</button> : null}<button type="button" onClick={onClose}>取消</button><button type="submit" disabled={busy}>保存</button></footer>
      </form>
    <p className="service-storage-note">API Key 保存在本机，不随项目导出。</p>
  </SettingsDialog>
}
