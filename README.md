# HonoBox - AI Gateway

Open-source LLM Gateway with real-time monitoring dashboard.

## Preview

![Dashboard](preview/截屏2026-09-01%2015.58.09.png)

![API Management](preview/截屏2026-09-01%2016.03.37.png)

## Features

- **Multi-model routing** — OpenAI, Anthropic, DeepSeek, custom providers
- **OpenAI-compatible API** — Drop-in replacement for `/v1/chat/completions`
- **Real-time monitoring** — SSE-based live dashboard updates
- **API Key management** — Database-backed keys with per-key rate limiting
- **Model management** — CRUD models via API or dashboard
- **Request tracing** — Full trace ID across all logs
- **PostgreSQL persistence** — Request logs, API keys, and models

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js + TypeScript (strict) |
| Backend | Hono + Drizzle ORM + PostgreSQL |
| Frontend | React 19 + TanStack Query + Recharts |
| Real-time | Server-Sent Events (SSE) |
| Testing | Vitest (20 tests) |
| Monorepo | pnpm workspace |

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL (or Docker)

### 1. Start PostgreSQL

```bash
# Option A: Docker (recommended)
docker run -d --name ai-gateway-db \
  -p 5432:5432 \
  -e POSTGRES_DB=ai_gateway \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16-alpine

# Option B: Use your local PostgreSQL
# Create database: ai_gateway
```

### 2. Install & Configure

```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/gateway/.env.example apps/gateway/.env
# Edit apps/gateway/.env with your API keys
```

### 3. Initialize Database

```bash
cd apps/gateway
npx drizzle-kit push
```

### 4. Start Development

```bash
pnpm dev

# Gateway: http://localhost:3000
# Dashboard: http://localhost:5173
```

### 5. Add a Model

```bash
# Via Dashboard: http://localhost:5173 -> Models -> Add Model

# Or via API:
curl -X POST http://localhost:3000/api/models \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-4o",
    "provider": "openai",
    "modelId": "gpt-4o",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-your-key"
  }'
```

### 6. Create API Key

```bash
# Via Dashboard: http://localhost:5173 -> API Keys -> Create Key

# Or via API:
curl -X POST http://localhost:3000/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My App"}'
```

## API Usage

```bash
# List models
curl http://localhost:3000/v1/chat/models

# Chat completion
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Chat completion (streaming)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'

# Health check
curl http://localhost:3000/health
```

## Testing

```bash
pnpm test
```

```
 ✓ apps/gateway/src/lib/__tests__/request-store.test.ts (7 tests)
 ✓ apps/gateway/src/providers/__tests__/index.test.ts (5 tests)
 ✓ apps/gateway/src/routes/__tests__/health.test.ts (1 test)
 ✓ apps/gateway/src/routes/__tests__/chat.test.ts (3 tests)
 ✓ packages/shared/src/__tests__/types.test.ts (3 tests)

 Test Files  5 passed (5)
      Tests  20 passed (20)
```

## Project Structure

```
honobox/
├── apps/
│   ├── gateway/          # Hono API server
│   │   ├── src/
│   │   │   ├── providers/    # Model provider abstraction
│   │   │   ├── routes/       # API routes
│   │   │   ├── middlewares/  # Auth, rate-limit, trace
│   │   │   ├── db/           # Drizzle schema & connection
│   │   │   └── lib/          # Logger, event-bus, etc.
│   │   └── drizzle.config.ts
│   │
│   └── dashboard/        # React frontend
│       └── src/
│           ├── features/     # Dashboard, API Keys, Models, Logs
│           └── components/   # Layout, UI components
│
├── packages/
│   └── shared/           # Shared TypeScript types
│       └── src/
│
├── pnpm-workspace.yaml
└── package.json
```

## Environment Variables

```bash
# apps/gateway/.env

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=ai_gateway

# Server
PORT=3000
```

## License

MIT
