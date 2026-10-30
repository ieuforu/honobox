# Go Inspector on a small VPS

Target: `https://inspector.selena.ink` behind the existing Caddy service.

- Binary releases: `/srv/honobox-inspector/releases/<release-id>/honobox`
- Active release: `/srv/honobox-inspector/current`
- Service: `honobox-inspector.service`, separate unprivileged user
- SQLite state: `/var/lib/honobox-inspector/traces.db`
- Private configuration: `/etc/honobox-inspector.env`, root-owned `0600`
- Listener: `127.0.0.1:3101`; no new public application port
- Reverse proxy: `/etc/caddy/sites/inspector.caddy`

The environment file sets `HONOBOX_DEMO_MODE=true` and requires both access
tokens. `DEEPSEEK_API_KEY` is stored only in that private environment file and is
never shipped inside the binary. Deployment access credentials stay outside
the repository.

Anonymous readers can inspect only server-generated LAB records. Scenario
buttons select saved examples without creating work. Private LIVE records,
lab execution and inference requests remain authenticated. Invalid access
tokens return 401 instead of silently switching back to demo access.

Use the browser's **Owner connection** to enter the two inspector access tokens.
They are independent of the provider key.

## Build and release

1. Run `pnpm check` and build frontend assets.
2. Build `apps/inspector` with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`.
3. Upload the binary and record its SHA-256 in an immutable release directory.
4. Install the supplied systemd service; create a dedicated system user.
5. Write secrets over an encrypted SSH stdin stream; never pass them as shell
   arguments or print the environment file.
6. Point `current` at the release, start the service and check `/healthz` locally.
7. Install the supplied Caddy include, validate the full config, then reload.
8. Seed the five lab scenarios with the admin token over loopback.
9. Check HTTPS, anonymous write rejection, private-record isolation, and an
   authenticated streaming request through the public reverse proxy.

Rollback by pointing `current` back to the prior release and restarting the
inspector service. Keep the state directory and environment file across updates.
Back up a Caddy include before replacing it; restore it if validation fails.
