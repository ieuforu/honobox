# HonoBox — AI Gateway

基于 Hono 的轻量级 AI 网关，代理 LLM 请求，提供全链路可观测、限流和持久化能力。

## 核心能力

- **SSE 流式代理** — 透传 Dify Chat API 的流式响应，前端无感知
- **全链路追踪** — 每个请求自动分配 traceId，贯穿所有日志和数据库记录
- **结构化日志** — Pino 记录每次 LLM 调用的延迟、token 用量、状态码
- **请求持久化** — 每次 LLM 调用写入 PostgreSQL，支持事后分析和成本核算
- **滑动窗口限流** — 基于 PostgreSQL 的限流，无需 Redis，防止单用户打爆配额

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js + TypeScript (strict) |
| Framework | [Hono](https://hono.dev) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Database | PostgreSQL |
| Validation | [Zod](https://zod.dev) |
| Logger | [Pino](https://getpino.io) |
| Lint / Format | [oxlint](https://oxc-project.github.io/oxlint) + [oxfmt](https://oxc-project.github.io/oxfmt) |

## Architecture

```
Client (SSE)
  │
  ▼
┌─────────────────────────────────────────┐
│  Hono Server                            │
│                                         │
│  traceMiddleware  ── 全链路 traceId      │
│       │                                 │
│  rateLimitMiddleware ── PG 滑动窗口     │
│       │                                 │
│  POST /api/chat/stream                  │
│       │                                 │
│  callDify() ── fetch Dify SSE 流        │
│       │                                 │
│  streamSSE ── 透传给客户端              │
│       │                                 │
│  logLLMRequest() ── Pino 结构化日志     │
│  db.insert(llmRequests) ── 持久化       │
└─────────────────────────────────────────┘
         │
         ▼
   Dify Chat API (SSE)
```

## Quick Start

```bash
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DB 和 Dify 配置

# 建表
npx drizzle-kit migrate

# 启动
pnpm dev
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | 健康检查（含 DB 连接状态） |
| POST | /api/chat/stream | SSE 流式 LLM 代理 |
| GET | /api/users | 用户列表 |
| POST | /api/users | 创建用户（Zod 校验） |
| PUT | /api/users/:id | 更新用户（JWT 认证） |
| DELETE | /api/users/:id | 删除用户（JWT 认证） |

### 测试流式接口

```bash
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "你好"}'
```

### 响应头

```
X-Trace-Id: aBcDeFgHiJkL    ← 每个请求唯一
Content-Type: text/event-stream
```

### SSE 事件格式

```
event: message
data: {"type":"chunk","content":"你好","conversation_id":"..."}

event: message
data: {"type":"done","conversation_id":"...","message_id":"..."}
```

## 数据库设计

```sql
-- LLM 调用记录
llm_requests (
  id            UUID PRIMARY KEY
  trace_id      VARCHAR(64)     -- 全链路追踪 ID
  model         VARCHAR(100)    -- 模型名称
  latency_ms    INTEGER         -- 响应延迟
  status_code   INTEGER         -- HTTP 状态码
  is_fallback   BOOLEAN         -- 是否走了备用模型
  prompt_tokens INTEGER         -- 输入 token
  completion_tokens INTEGER     -- 输出 token
  error         TEXT            -- 错误信息
  created_at    TIMESTAMP
)

-- 限流记录
rate_limits (
  id            UUID PRIMARY KEY
  key           VARCHAR(128)    -- 用户标识
  window_start  TIMESTAMP       -- 窗口起始时间
  count         INTEGER         -- 窗口内请求次数
  UNIQUE(key, window_start)
)
```

## Project Structure

```
src/
├── index.ts                # Entry — server startup
├── app.ts                  # Global middleware + route mounting
├── config/                 # Environment variables
├── lib/
│   ├── logger.ts           # Pino base logger + trace child logger
│   ├── llm-logger.ts       # LLM 请求结构化日志
│   ├── dify.ts             # Dify SSE 流式调用封装
│   └── format.ts           # Utilities
├── middlewares/
│   ├── trace.ts            # Trace ID 中间件
│   ├── rate-limit.ts       # PG 滑动窗口限流
│   ├── auth.ts             # JWT 认证
│   └── validator.ts        # Zod 校验
├── routes/
│   ├── chat.ts             # SSE 流式代理路由
│   ├── users.ts            # User CRUD
│   └── health.ts           # Health check
├── db/
│   ├── index.ts            # Drizzle connection
│   └── schema/
│       ├── users.ts        # Users table
│       ├── llm-requests.ts # LLM 请求记录
│       └── rate-limits.ts  # 限流记录
├── services/               # Business logic
└── types/                  # Shared TypeScript types
```

## License

MIT
