# VPS deployment

The public demo runs as a Node systemd service behind Caddy, with PostgreSQL in a private Docker network.

## Runtime layout

- Application: `/srv/honobox/current`
- Secrets: `/etc/honobox.env` (`0600`, never committed)
- Gateway: `127.0.0.1:3100`
- Dashboard: static files served by Caddy
- Database: PostgreSQL bound only to loopback

## Release checklist

1. Sync the repository to `/srv/honobox/current` and start `deploy/vps/compose.yaml` with the private `DB_PASSWORD` from `/etc/honobox.env`.
2. Install with `corepack pnpm install --frozen-lockfile`.
3. Run `pnpm check`.
4. Apply migrations with `pnpm --filter @ai-gateway/gateway db:migrate`.
5. Optionally seed synthetic portfolio data with `pnpm demo:seed`.
6. Install `honobox.service`, add the Caddy site, validate both configs, then reload.
7. Verify `/health`, public demo authentication, read-only mutation blocking, and static assets.

`DEMO_MODE=true` enables the special `demo` bearer token for GET/HEAD requests only. The regular admin token remains private and retains control-plane write access.
