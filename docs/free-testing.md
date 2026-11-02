# 不充值的 Inspector 开发与 API 测试

日常开发使用本地 Lab：不需要模型账号、API Key 或服务器算力。真实 API 只用于最后确认一次兼容性，和离线测试分开进行。

## 先使用本地 Lab

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev:inspector
```

打开 `http://127.0.0.1:3100`，可以测试工具参数分片、断流、服务不可用、超时和取消。Lab 经过同一套转发与记录逻辑，但不会连接模型供应商。没有 Key 时，真实请求入口返回 503；Lab 仍然可用。

## 可选：OpenRouter 免费模型

截至 2026-11-02，OpenRouter 的 Free 方案提供 API 访问，免费模型通常限制为每分钟 20 次、每天 50 次。供应商也可能因为负载拒绝请求；它不是生产可用性承诺。此工作流不需要购买 credits。[官方价格](https://openrouter.ai/pricing)、[额度与限流](https://openrouter.ai/docs/api_reference/limits)

在 [OpenRouter Keys](https://openrouter.ai/settings/keys) 创建自己的 Key，并私下设置到启动进程的 `OPENROUTER_API_KEY` 环境变量中。不要把 Key 放进浏览器、聊天、源码或提交记录。普通启动不自动读取 `.env` 文件。

然后在同一个终端设置模式并启动：

```sh
export HONOBOX_PROVIDER=openrouter-free
export HONOBOX_MODEL=openrouter/free
pnpm dev:inspector
```

| 配置 | 免费模式行为 |
| --- | --- |
| `HONOBOX_PROVIDER=openrouter-free` | 明确启用免费模型模式；不设置时保留原 DeepSeek 行为 |
| `OPENROUTER_API_KEY` | 只在服务端使用；不会使用 `DEEPSEEK_API_KEY` 替代 |
| `HONOBOX_MODEL` | 默认 `openrouter/free`，也接受明确的 `owner/model:free` |
| `HONOBOX_UPSTREAM_BASE_URL` | 此模式忽略该变量，固定使用 `https://openrouter.ai/api/v1` |

`openrouter/free` 会在可用免费模型中选择，具体模型和表现可能变化。固定模型时，必须先确认其在目录里确实有 `:free` 版本，不能给任意收费模型加后缀就获得免费访问。[免费路由器](https://openrouter.ai/openrouter/free)、[免费模型版本](https://openrouter.ai/docs/guides/routing/model-variants/free)

### 只发一条兼容性请求

服务启动后，可在 UI 的请求编辑器中使用下面的 body，手动发送一次：

```json
{
  "model": "openrouter/free",
  "stream": true,
  "max_tokens": 64,
  "messages": [{ "role": "user", "content": "Reply with one short greeting." }]
}
```

检查 HTTP 状态、首个输出、原始 SSE 和结束状态。遇到 429 或不可用就停止，继续使用 Lab；Inspector 不自动重试，也不自动换成付费模型。免费额度由 OpenRouter 账户统一计算，在此之外使用同一账号也会消耗额度。

### 免费模式的约束

- 后端拒绝收费模型、额外模型变体和重复顶层 JSON 字段。仅接受 `openrouter/free` 或明确的 `owner/model:free`。
- 请求采用字段白名单，拒绝 `models`、`provider`、`route`、`preset`、`plugins` 等路由或扩展参数，也拒绝未审查的新字段。原 DeepSeek 模式仍按原样透传供应商字段。
- 支持文本消息、流式输出和客户端 `function` 工具；不支持文件、图片、音频处理或供应商执行的搜索等服务。工具实际执行仍由调用方负责。
- 后端添加 `provider.allow_fallbacks=false`，并把 prompt、completion、request、image 的 `max_price` 设为 0。客户端不能覆盖这些限制。如果没有匹配端点，让请求失败。[价格过滤说明](https://openrouter.ai/docs/guides/routing/provider-selection#max-price)
- 不转发客户端自定义供应商头，也不跟随上游重定向。API Key 不返回给 UI、不写入 trace；消息与输出仍会记录到本地 SQLite。

这些限制针对当前请求，不能控制其他客户端如何使用你的 OpenRouter Key。免费服务规则也可能变化；升级或替换接口前应重新核对官方文档。

## 已验证与未验证的边界

Go 回归测试使用本地模拟服务或拦截 HTTP transport，验证收费模型和路由覆盖被拒绝、固定目的地址、零价格边界、缺 Key 行为及 Lab 可用性。测试与 CI 不调用真实模型，不消耗免费请求额度。

实现时没有进行真实 OpenRouter 调用。账号能否访问、当时免费模型的可用性、工具调用质量和真实响应延迟，需要你用自己的 Key 手动验证。
