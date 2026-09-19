# Fault-injection report - 2026-09-18

This report is generated from the reproducible `pnpm lab:fault` scenario. It is a local engineering measurement, not a claim about public-cloud capacity.

## Environment

| Item | Value |
| --- | --- |
| Machine | Apple Silicon macOS (`darwin-arm64`) |
| Node.js | 26.9.0 |
| PostgreSQL | 16, local Docker container |
| Load | 100 requests per scenario, concurrency 10 |
| Providers | deterministic local OpenAI-compatible mock |

## Results

| Scenario | Errors | Served by fallback | P50 | P95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Healthy primary | 0 / 100 | 0 / 100 | 11.55 ms | 27.52 ms | 32.63 ms |
| Primary returns HTTP 503 | 0 / 100 | 100 / 100 | 10.19 ms | 13.54 ms | 16.34 ms |

The lower steady-state failover latency is expected in this synthetic run: after three retryable failures the primary circuit opens, so later requests skip the known-bad upstream and go directly to the fallback.

## Assertions executed by the lab

- All healthy requests were served by the primary model.
- All injected-failure requests completed successfully through the fallback model.
- A streaming HTTP 503 before the first chunk switched providers and returned a valid SSE stream.
- Prometheus output recorded both fallback traffic and upstream failures.
- Unit coverage separately verifies that a failure after the first streaming chunk never switches providers.

## Reproduce

```bash
docker compose up -d --wait postgres
pnpm --filter @ai-gateway/gateway build
pnpm lab:fault
```

The lab creates short-lived model and API-key records, runs the scenarios, asserts the results, and removes its records afterward.
