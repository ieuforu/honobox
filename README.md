# HonoBox - AI Gateway

Open-source LLM Gateway with real-time monitoring dashboard.

## Preview

![Dashboard](preview/截屏2026-09-01%2015.58.09.png)

![API Management](preview/截屏2026-09-01%2016.03.37.png)

## Features

- **Multi-model routing** — OpenAI, Anthropic, DeepSeek, custom providers
- **OpenAI-compatible API** — Drop-in replacement for `/v1/chat/completions`
- **Real-time monitoring** — Dashboard with usage analytics
- **API Key management** — Team-level keys with rate limiting
- **Request tracing** — Full trace ID across all logs
- **PostgreSQL persistence** — Request logs and rate limiting

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js + TypeScript (strict) |
| Backend | Hono + Drizzle ORM + PostgreSQL |
| Frontend | React 19 + TanStack Query + Recharts |
| Auth | JWT + API Key (Bearer) |
| Logging | Pino (structured) |

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start development
pnpm dev

# Gateway: http://localhost:3000
# Dashboard: http://localhost:5173
```

## API Usage

```bash
# List models
curl http://localhost:3000/v1/chat/models

# Chat completion (streaming)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-test-1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'

# Health check
curl http://localhost:3000/health
```

## Project Structure

```
honobox/
├── src/
│   ├── providers/      # Model provider abstraction
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   └── index.ts
│   ├── routes/
│   │   ├── chat.ts     # /v1/chat/completions
│   │   ├── api-keys.ts # API Key management
│   │   └── stats.ts    # Usage statistics
│   ├── middlewares/
│   │   ├── trace.ts    # Request tracing
│   │   └── rate-limit.ts # Rate limiting
│   └── db/
│       └── schema/     # Drizzle schema
├── dashboard/          # React frontend
│   └── src/
│       └── features/
│           └── dashboard/
├── pnpm-workspace.yaml
└── package.json
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/ai_gateway

# Model API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...

# Server
PORT=3000
```

## License

MIT
