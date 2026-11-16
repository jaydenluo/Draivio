# A07 独立复核（2026-11-14）

- `requestChatCompletion` 使用共享 `requestProviderJson` 的 `chat/completions` path，API key 只进入 header；支持 AbortSignal/timeout、vision `image_url` content、HTTP 401/403/429 明确错误且无自动重试。
- `parseChatResponse` 解析真实 OpenAI tool_calls 与 JSON arguments；`parseJsonPlan` 校验 steps 数组、步骤数量和 op 字段，并递归拒绝 apiKey/token/password 等凭据字段。
- 独立验证：A07/chat + request 2 files / 6 tests passed；`npm run build`、`vibeplan check` passed（仅既有构建 warnings）。未调用真实付费 API。

## Repair cycle 2 — 2026-11-14

Prior completion overstated cancellation/timeout support: provider wrapper dropped signal, caller signal disabled timeout, and response bytes were unbounded. Reopened same task legally (v15), repair plan v16.

Independent code review confirms caller signal reaches requestJson; a private AbortController combines caller cancellation and independent timeout, retained through streamed body consumption; Content-Length and streamed byte counting enforce a default 64 MiB bound, cancelling excess streams. Listener and timeout cleanup occurs in finally. Error bodies remain discarded and no automatic retries were added.

Actual independent verification: `npm test -- --run src/ai/providers/chatAdapter.test.ts src/ai/providers/chatAdapter.fetch.test.ts src/lib/request.test.ts src/creation/AIComposer.editPlan.test.tsx src/ai/ui/EditRunSummary.test.tsx src/ai/ui/editRunIntegration.test.ts` exited 0, 6 files / 16 tests. Of these A07 accounts for 3 files / 10 tests. Fetch boundary tests mock only global fetch, retaining real adapter/provider/HTTP chain; cover caller abort, timeout with caller signal, body-read cancellation, declared/streamed limits, vision/auth and 401/429 single attempts. `npm run build` and `vibeplan check` exited 0. No paid external API call.
