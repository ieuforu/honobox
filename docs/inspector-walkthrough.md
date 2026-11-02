# Inspector：两分钟演示与工程导读

## 从零费用演示开始

```sh
pnpm install --frozen-lockfile
pnpm demo:inspector
```

打开终端给出的本地地址。无需 Go、数据库、API Key；网页使用明确标记的合成样例。
正常生产构建也能通过 `/?offline=1` 打开同一离线模式。默认入口仍连接 Go Inspector。

1. **工具参数分片（约 40 秒）**：选择 Tool call，把播放位置拖回开头，逐事件前进。
   `{"city":` 暂时不是有效 JSON；后续片段组成 `{"city":"Shanghai"}`。说明“收到工具调用”
   与“实际执行工具”是两个边界，Inspector 只观察，调用方决定是否执行。
2. **成功连接后的失败（约 40 秒）**：选择 Broken stream，展示 HTTP 200 与 interrupted 同时存在。
   对照已收到的部分文本、缺失的 `[DONE]` 和最终状态。进入 Raw response 查看捕获内容。
3. **取消与可复现记录（约 40 秒）**：选择 Slow stream 的取消样例，观察取消前的输出。
   Export JSON 查看快照，再通过 Import trace 粘贴打开。这个动作不重新发送模型请求。

样例的时间是人为设定的数据，不能当作模型速度评测。离线 UI 成功也不能证明真实提供商可用。

## 三个能深入解释的问题

### HTTP 状态与流生命周期为什么分开

HTTP 状态在响应头到达时确定，流可能随后断开、超时或包含 provider error。
[`proxy.go`](../apps/inspector/internal/server/proxy.go) 先记录 headers，再读取 SSE，并独立计算终态。
因此 HTTP 200 + interrupted 是有意义的组合。捕获上限导致观察停止时，也不能用“没记录到结束标记”
直接判定上游故障；页面必须展示 truncated。

验证：Go 的 server 测试覆盖正常结束、断流、上游错误与取消；前端 recording 测试保留 HTTP/终态差异。

### 工具参数为什么不能每个片段都 JSON.parse 后丢弃

参数是增量字符串，单片段可能只有半个字段。前端 [`types.ts`](../apps/inspector/ui/types.ts)
按 tool index 累加名称和参数，最后再尝试格式化；原始事件仍可检查。
目前 overview 只展示 completion choice 0，这是展示范围的取舍，其他数据留在事件记录中。

验证：前端测试对照第一个参数片段与完整参数；离线滑块回退时不会泄露后续输出。

### 取消如何跨越浏览器与 Go

浏览器 AbortController 中断 fetch；Go 的 request context 取消上游请求，并通过独立短时 context 保存终态。
mock 的 writer 也监听取消，避免客户端断开后写入阻塞。取消不会撤回已经执行的外部操作，
也不代表提供商不计已处理的 token。

验证：使用本地 Go Lab 的 Slow stream，再按 Cancel request；这是实际取消路径。
离线取消样例仅用于讲解，不会执行这条网络路径。需要额外验证模型接入时参见 [免费测试](free-testing.md)。

## 代码与数据边界

```text
浏览器离线模式：合成样例 / 用户粘贴快照 → 校验 → 内存记录 → 逐事件展示
                 无 /api、/v1 请求；刷新清除导入

本地 Lab / Live：浏览器或客户端 → Go 转发 + SSE 观察 → SQLite
                                       ↓
                               本地模拟器 / 可选模型 API
```

- [`recordings.ts`](../apps/inspector/ui/recordings.ts)：版本化格式、1 MiB/300 事件限制、时间戳校验、播放投影。
- [`RecordingControls.tsx`](../apps/inspector/ui/RecordingControls.tsx)：播放、导入、导出预览；不包含 API 调用。
- [`provider.go`](../apps/inspector/internal/server/provider.go)：可选免费提供商的模型与参数限制。
- SQLite 保存真实网关记录；导入快照只在当前网页内存中，不能改写服务端历史。
- 导出不会自动删除所有敏感内容。生产数据分享前需要审阅，演示优先使用合成数据。

## 验证命令与局限

```sh
pnpm --filter @honobox/inspector test
pnpm --filter @honobox/inspector build
pnpm check
```

测试不会访问模型供应商。浏览器验收应覆盖：重复选择同一记录、滑块归零/前进/回退、非法 JSON 提示、
导出后重新导入、窄屏与空搜索结果。截图和性能数字应注明来自实际测试的环境；不要把固定样例的时间当成性能结论。

当前没有跨请求的 agent 会话树、自动根因分析或真实工具执行。先把单次请求的生命周期解释准确。
