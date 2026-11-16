# 请求与消息规范

业务代码通过 `src/lib/request.ts` 的 `requestProviderJson` 请求供应商，传入 baseUrl、apiKey、protocol、path、method、body/query、timeoutMs。其他 JSON HTTP 使用 `requestJson`；只有 `src/lib/http.ts` 直接调用 fetch。桌面 IPC 使用 `src/lib/native.ts` 的 invokeCommand，Rust 网络操作使用 `network::client` 与 `network::send_json`。

HTTP 统一禁止重定向、设置超时、区分网络/超时/格式错误，丢弃非成功响应正文、保留状态码与 Retry-After；不打印密钥、提示词或供应商错误正文，不自动重试。业务负责把状态码转换为领域提示，图片请求中断仍标为结果未知。开发环境供应商模型列表与 OpenAI 兼容生图使用 `dev/providerRelay.ts` 的同源本机转发；只允许环回客户端和同源 Fetch 元数据，限定路径/方法，POST 请求体上限 1 MiB，不转发 Cookie。

通知统一调用 `src/ui/message.ts`：

```ts
const feedback = message.loading('正在获取模型列表…', { key: 'models' })
try {
  const models = await fetchConnectionModels(connection)
  feedback.success(`已获取 ${models.length} 个模型`)
} catch (error) {
  feedback.error(error instanceof Error ? error.message : '获取模型列表失败')
}
```

message 支持 info/success/warning/error/loading；loading 返回 close/success/warning/error 句柄，结果替换原消息。相同 key 更新而非重复堆叠；普通通知自动消失，可手动关闭。业务组件卸载时关闭尚未完成的 loading，忽略迟到结果。message 不等于取消请求。

AppShell 挂载唯一 MessageHost，显示紧凑顶部通知。打开模态弹窗后，消息会迁移到最上层弹窗 DOM 内，保持视觉顶层与无障碍可读。来源编辑不再放请求结果段落；生成以整个批次汇总通知，局部保留进度、重试、未知结果确认与“查看原因”。传输层不直接显示 message，避免分页与并发请求重复提示。

未来新增 API 应沿用上述入口和业务通知规则。静态生产网页仍依赖供应商允许 CORS，桌面使用原生请求。此次验证未读取用户真实密钥或提交付费生图。
