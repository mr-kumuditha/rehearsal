# Deploying without replacing the real experiment

The public deployment uses Vercel for the web interface and a DigitalOcean VPS for the HTTP engine. Each rehearsal reaches three real HTTP sandbox providers on the VPS.

```text
Browser → Vercel /api/runs → authenticated HTTPS → VPS backend
                                                  ├─ inventory HTTP
                                                  ├─ payment HTTP
                                                  ├─ WSO2 HTTPS → delivery HTTP
                                                  └─ SQLite on persistent disk
```

## Current deployment

The web app is at https://rehearsal-kumuditha.vercel.app. The backend origin is https://rehearsal-api.178-128-219-13.sslip.io. Both are connected; see [the verification record](VERIFICATION.md) for the live checks and remaining limits.

The VPS was resized to 4 GB RAM, two CPUs and a 78 GB filesystem. It runs Node.js 24.20.0 as a systemd service, with Nginx terminating HTTPS. Docker is an optional path, not this server's runtime. The backend source release is `7a9ee7d`, selected through `/opt/rehearsal/current`. The previous release `def6b05` remains available for rollback.

WSO2 API Manager 4.7.0 runs separately as the `wso2` user with Java 21. Its control plane and gateway ports are private; UFW allows public ports 22, 80 and 443 only, on IPv4 and IPv6. The runner reaches delivery through the private HTTPS gateway, while inventory and payment stay direct. See [WSO2 setup and credential maintenance](WSO2.md). The server reboot during the resize brought the pre-existing backend and Nginx back online; the newly installed gateway has not yet been tested through a full VPS reboot.

The backend hostname uses [sslip.io](https://github.com/cunnie/sslip.io), whose DNS resolves the address encoded in the hostname. This is an external DNS dependency for the portfolio demo. To move to a domain you control, point its A record to the VPS, obtain a certificate, update the Nginx hostname and set `BACKEND_URL` in Vercel before redeploying.

Vercel does not provide a persistent local filesystem for SQLite; see its [SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel). We keep the database on the VPS and connect through the web app's server-side proxy.

## Native backend on the VPS

Inspect the existing server before installing or restarting anything. In particular, check which processes own ports 80, 443 and 4320, whether Docker is installed, and whether an existing reverse proxy already serves other applications. Preserve those applications.

The checked-in `vps-backend/systemd/rehearsal.service` runs as the dedicated `rehearsal` user. Its HTTP listener and all three providers bind to loopback. The service starts on boot, restarts after a failure and has a 192 MB memory limit. Application source stays read-only; reports are stored under `/var/lib/rehearsal/runs.sqlite`, outside the release directory.

The server's private credential lives in `/etc/rehearsal/backend.env` with root-only read access. systemd reads that file before starting the service. The same value is stored as the production `BACKEND_TOKEN` secret in Vercel. It is never included in the source archive or sent to the browser.

The optional root-only `/etc/rehearsal/gateway.env` sets the delivery URL, OAuth client credentials and Node's extra certificate trust. Only the backend loads this file. Keep it separate from API Manager administration credentials, and do not copy either file into a Git archive.

For a fresh server, install Node.js 24 from the [official release distribution](https://nodejs.org/dist/latest-v24.x/) and verify the archive against its published SHA-256 checksum. The service expects the runtime at `/opt/rehearsal/node/bin/node` and source at `/opt/rehearsal/current`. Create the `rehearsal` system user, install the unit in `/etc/systemd/system/rehearsal.service`, provision the credential privately, then run `systemctl daemon-reload` and `systemctl enable --now rehearsal`.

For a source update, extract a reviewed Git archive into a new `/opt/rehearsal/releases/<commit>` directory, switch `current` to that directory and restart only `rehearsal.service`. Keep the previous release for rollback. The database remains in `/var/lib/rehearsal`; a source rollback does not roll back its contents. Back it up with SQLite's backup API before migrations or server maintenance.

Useful checks:

```sh
systemctl status rehearsal --no-pager
journalctl -u rehearsal -n 30 --no-pager
curl --fail http://127.0.0.1:4320/ready
```

## HTTPS and renewal

Nginx and Certbot are installed from Ubuntu's package repositories. Render `__BACKEND_DOMAIN__` in `vps-backend/nginx-http.conf` with the chosen hostname for the initial certificate request. Its ACME webroot is `/var/www/rehearsal-acme`. After obtaining a certificate with Certbot's webroot method, render and install `vps-backend/nginx.conf` instead. Run `nginx -t` before reloading the proxy.

The HTTPS configuration forwards streamed responses without buffering, caps bodies at 2 KB and limits traffic to 10 requests per second per connecting IP and 20 per second globally, with bounded bursts. The connecting IP is generally a Vercel egress address, not the visitor's address. These limits supplement the backend's four-run global and one-run-per-workspace concurrency caps. They are small-demo limits, not a per-user quota system.

`certbot.timer` schedules renewal. Install `vps-backend/reload-nginx.sh` as an executable in `/etc/letsencrypt/renewal-hooks/deploy/` so Nginx loads renewed certificates. The live certificate expires on 5 December 2026; a renewal dry run passed on 6 September 2026. This checks the renewal path at that time, not a future renewal outcome.

## Optional Docker deployment

The repository also includes `vps-backend/Dockerfile` and `vps-backend/compose.yaml`. Use this on a server with enough memory; it was not used for the live deployment. From a checkout on the VPS:

```sh
# Supply BACKEND_TOKEN through a private environment file or secret manager.
docker compose -f vps-backend/compose.yaml up -d --build
```

`BACKEND_TOKEN` must be unique, at least 32 characters, and identical to the value set privately in Vercel. Never commit it, paste it into a public issue, or use the token from the test suite.

Compose exposes the backend at **127.0.0.1:4320 on the VPS**, not on the public network. Configure the server's existing HTTPS reverse proxy to forward a dedicated backend hostname to that port, without buffering streamed responses. Set a request body limit of about 2 KB, a request timeout of at least 30 seconds and a sensible public rate limit. Do not disable TLS certificate validation.

In Docker, the three provider ports remain internal to the container. Reports live in the `rehearsal-data` named Docker volume, mounted at `/data`. Container recreation preserves that volume. `docker compose down -v` deletes it: do not use that command if reports need to survive. Back up the volume or use SQLite's backup mechanism before server maintenance.

`GET /ready` is a minimal unauthenticated liveness check. `/health` and `/runs` require the backend credential. The backend caps active runs at four globally and one per workspace per process. This is a single-instance guard, not a distributed rate limiter. A reverse-proxy rate limit is still necessary before opening the demo to unrestricted traffic.

## Web app on Vercel

Import the public GitHub repository, keep the Next.js preset, use Node.js 24 and `npm run build`. Add these **server-side** environment variables:

| Variable | Meaning |
| --- | --- |
| `BACKEND_URL` | HTTPS origin of the VPS backend, without credentials |
| `BACKEND_TOKEN` | The same private credential used by the backend |
| `APP_ORIGIN` | Canonical HTTPS URL of the web app, particularly for a custom domain |

None of these variables belongs under `NEXT_PUBLIC_`. The app uses Vercel's production/preview hostname variables for origin validation. If the backend is not configured, the API returns an explicit unavailable response rather than attempting to start local providers inside a Vercel function.

## Visitor history

The Vercel proxy assigns an opaque workspace ID in an HTTP-only, same-site cookie and passes it to the authenticated backend. Report queries are scoped to that workspace. Clearing the cookie creates a new workspace; there is no account recovery or cross-device history yet. The workspace cookie is an access capability, not a user account. The raw backend credential never reaches the browser.

## Live acceptance checklist

- Confirm HTTPS and `/ready` on the intended backend domain.
- Confirm `/runs` rejects a request without the backend credential.
- Run all four recovery scenarios through the public Vercel URL.
- Show a failing baseline beside its passing recovery in the comparison view.
- Reload the browser and verify reports remain available.
- Open a separate browser context and verify the first visitor's reports are not visible.
- Restart the native backend service (or recreate a Docker container without removing its volume); verify completed history survives.
- Record the deployed Git commit and test results. Neither API Manager nor Ballerina should be marked connected unless separately verified.
