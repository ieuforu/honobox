# hono-app

Hono + Drizzle ORM + PostgreSQL + Zod + Pino

## Tech Stack

- **Runtime**: Node.js
- **Framework**: [Hono](https://hono.dev)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team)
- **Database**: PostgreSQL
- **Validation**: [Zod](https://zod.dev)
- **Logger**: [Pino](https://getpino.io)
- **Lint**: [oxlint](https://oxc-project.github.io/oxlint)
- **Format**: [oxfmt](https://oxc-project.github.io/oxfmt)

## Quick Start

```bash
pnpm install

# 创建数据库
psql -U postgres -c "CREATE DATABASE hono_test;"

# 推送 schema
npx drizzle-kit push

# 启动
pnpm dev
```

## Project Structure

```
src/
├── index.ts              # Entry — server startup
├── app.ts                # Global middleware + route mounting
├── config/               # Environment variables
├── lib/                  # Utilities (logger, format)
├── db/
│   ├── index.ts          # Drizzle connection
│   └── schema/           # Table definitions
├── middlewares/           # Auth, Zod validator
├── routes/               # Route handlers
├── services/             # Business logic (no HTTP details)
└── types/                # Shared TypeScript types
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/users | List users (?search=) |
| GET | /api/users/:id | Get user |
| POST | /api/users | Create user (Zod validated) |
| PUT | /api/users/:id | Update user (auth required) |
| DELETE | /api/users/:id | Delete user (auth required) |

## Testing

Open the `bruno/` collection in [Bruno](https://www.usebruno.com).
