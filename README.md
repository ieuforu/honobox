# HonoBox

An authenticated, OpenAI-compatible LLM gateway with streaming proxying, encrypted provider credentials, per-key rate limits, and a real-time React control plane.

![CI](https://github.com/ieuforu/honobox/actions/workflows/ci.yml/badge.svg)

## Why HonoBox

HonoBox focuses on the parts of an LLM gateway that are easy to get subtly wrong:

- **Streaming lifecycle** — downstream disconnects propagate through `AbortSignal` and cancel the upstream request.
- **Failure isolation** — per-model circuit breakers and retry-before-first-token failover avoid cascading provider failures without mixing streamed output.
- **Separated access paths** — gateway API keys protect inference traffic; an independent admin token protects the control plane.
- **Secret handling** — gateway keys are stored as SHA-256 hashes and provider keys are encrypted with AES-256-GCM.
- **Request visibility** — trace IDs, latency, token usage, errors, and live SSE updates are available in the dashboard.
- **Provider adapters** — OpenAI-compatible providers, Anthropic, and DeepSeek share one request contract.

## Architecture

```text
Application                       React control plane
    │ Bearer sk-...                     │ Bearer ADMIN_TOKEN
    ▼                                   ▼
┌──────────────────────────────────────────────────────────┐
│                     Hono gateway                         │
│ auth → rate limit → circuit breaker → provider adapter  │
│                       retry/failover → stream lifecycle  │
└───────────────────┬───────────────────────┬──────────────┘
                    │                       │
              LLM providers           PostgreSQL
                                      configs + traces
```

## Preview

![Dashboard](preview/截屏2026-09-01%2015.58.09.png)

![Request logs](preview/截屏2026-09-01%2016.03.37.png)

## Stack

| Layer         | Technology                                            |
| ------------- | ----------------------------------------------------- |
| Gateway       | Hono, Node.js, TypeScript                             |
| Control plane | React 19, TanStack Query, Recharts                    |
| Persistence   | PostgreSQL, Drizzle ORM                               |
| Streaming     | Web Streams, SSE, AbortSignal                         |
| Quality       | Vitest, TypeScript project references, GitHub Actions |

## Run locally

Requirements: Node.js 22+, pnpm, and Docker.

```bash
pnpm install
cp apps/gateway/.env.example apps/gateway/.env

# Edit ADMIN_TOKEN and MODEL_ENCRYPTION_KEY first.
pnpm db:up
pnpm db:push
pnpm dev
```

- Dashboard: <http://localhost:5173>
- Gateway: <http://localhost:3000>
- Health check: <http://localhost:3000/health>

The dashboard asks for `ADMIN_TOKEN` on first load and keeps it only in the current browser tab.

## Configure a model and gateway key

Use the dashboard, or call the control-plane API with the admin token:

```bash
curl -X POST http://localhost:3000/api/models \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-4o",
    "provider": "openai",
    "modelId": "gpt-4o",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "your-provider-key"
  }'

curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"local-app","rateLimit":100}'
```

The generated gateway key is returned once. Only its hash and display prefix are persisted. A model can optionally reference another enabled model as its fallback in the dashboard or through the `fallbackModelId` field.

Failover is intentionally conservative: only network errors, timeouts, rate limits, and upstream 5xx responses are retryable. Streaming requests switch providers only before the first chunk reaches the client; once output begins, HonoBox never combines content from two providers.

## OpenAI-compatible usage

```bash
curl -N http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-gateway-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role":"user","content":"Hello"}],
    "stream": true
  }'
```

Available models are exposed at `GET /v1/chat/models` and require the same gateway key.

## Verify

```bash
pnpm check
```

This runs linting, type checking, tests, and production builds for every workspace package. The same command runs in GitHub Actions.

## Security model

- `ADMIN_TOKEN` is for control-plane operations and must not be used as an inference key.
- Gateway API keys are shown once and compared by hash.
- Provider credentials are encrypted at rest with `MODEL_ENCRYPTION_KEY`.
- Deploy behind HTTPS and rotate both admin and encryption secrets through your platform's secret manager.
- HonoBox is currently a single-node gateway; rate limits and traces are shared through PostgreSQL, while circuit state is process-local.

## Roadmap

- Weighted provider routing and health-aware failover
- Distributed circuit-breaker state for multi-node deployments
- OpenTelemetry and Prometheus export
- Reproducible fault-injection and load-test scenarios

## License

MIT
