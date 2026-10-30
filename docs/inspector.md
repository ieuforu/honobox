# HonoBox Inspector — Go + TypeScript preview

The first slice of the new inspector lives in `apps/inspector`. The existing Hono gateway and dashboard remain available while this separate Go service is developed. It is a single-machine development tool, with an explicit local simulation lab and optional live DeepSeek forwarding.

## Run the local lab

Requirements: Go 1.24+, Node.js 22+, pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev:inspector
```

Open `http://127.0.0.1:3100`. No provider key is required for the lab. Choose Tool call, Broken stream, Provider outage, Timeout, or Slow stream. Cancel a slow request to observe downstream cancellation. LAB records are synthetic; LIVE records came through the configured upstream.

The Go service captures actual responses from the simulator through the same forwarding and recording path used for live requests. It records received/headers/first output/finish/failure timing, preserves raw SSE bytes, and assembles tool-argument fragments in the browser. The gateway does not execute model-requested tools.

## Optional live DeepSeek connection

Set `DEEPSEEK_API_KEY` privately in the terminal environment that starts the service. Never put the provider key into the browser's Connection dialog, tracked source, issues, or chat. HonoBox does not read pi configuration files. You can keep using the lab while the key is unset.

Defaults follow the current [DeepSeek Chat Completions documentation](https://api-docs.deepseek.com/api/create-chat-completion/). Override `HONOBOX_MODEL` if your account uses another model.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | unset | Enables live requests; used only server-side |
| `HONOBOX_UPSTREAM_BASE_URL` | `https://api.deepseek.com` | API prefix, optionally ending in `/v1` |
| `HONOBOX_MODEL` | `deepseek-flash` | Default model in the browser's request editor |
| `HONOBOX_ADDR` | `127.0.0.1:3100` | Listener; stays local by default |
| `HONOBOX_DB_PATH` | `.data/inspector.db` | SQLite trace database |
| `HONOBOX_ADMIN_TOKEN` | unset on loopback | Protects trace access and lab actions |
| `HONOBOX_GATEWAY_TOKEN` | unset on loopback | Protects inference requests |
| `HONOBOX_DEMO_MODE` | `false` | Public, read-only LAB access; both tokens required |

Non-loopback listeners require both access tokens. The provider key is independent of these tokens. The browser's Connection dialog stores only the inspector access tokens in this tab's session storage.

Clients send Chat Completions requests to `http://127.0.0.1:3100/v1/chat/completions`; model, messages, tools, tool results, and provider-specific JSON fields are forwarded unchanged. The `X-Honobox-Trace-Id` response header identifies the captured request.

For an opt-in, three-request live check, run `pnpm build:inspector` and `pnpm test:deepseek`. That script accepts a key from its environment or the ignored `apps/inspector/.env.local` file, starts a temporary authenticated loopback inspector, verifies streamed text, streamed tool calls, and a tool-result round trip, then stops it and removes its test database. It prints only verification metadata. It is never part of `pnpm check` or CI. Normal server startup reads environment variables only; it does not automatically load that file.

## Build and verify

```sh
pnpm build:inspector
cd apps/inspector
go test -race ./...
go vet ./...
```

`bin/honobox` embeds the React production build and needs no Node runtime. The SQLite driver is pure Go. For Linux x86-64, build the web assets first and then use `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ../../bin/honobox-linux-amd64 ./cmd/honobox`.

For frontend development, run the Go service and `pnpm --filter @honobox/inspector dev` in separate terminals. Vite serves `http://127.0.0.1:5174` and proxies API requests to port 3100.

## Current boundaries

- Single process and local SQLite; no shared team or distributed tracing support.
- The UI lists the latest 100 requests; storage retains up to 500 completed requests plus in-flight work.
- Request bodies are limited to 1 MiB; captured response and event payloads each have a 256 KiB budget, with at most 300 events. A truncated capture is marked; upstream forwarding continues.
- At most eight concurrent forwarded/lab requests; additional calls receive HTTP 429.
- HTTP response status and final stream state are separate. An interrupted stream can legitimately have HTTP 200.
- First output means the first content or tool-call delta, not a tokenizer measurement.
- The overview renders the first completion choice. Raw events remain available for other choices.
- Provider authorization headers are not stored. Request bodies, output, and tool arguments are stored locally and can contain application data.
- No automatic retries or replay: replaying a tool-related request may have side effects in the client application.
- Real DeepSeek connectivity is not verified by mock-based tests.
