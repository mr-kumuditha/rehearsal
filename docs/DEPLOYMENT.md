# Deploying without replacing the real experiment

The intended public deployment uses Vercel for the web interface and a DigitalOcean VPS for the HTTP engine. It does not substitute an in-browser simulation for the providers.

```text
Browser → Vercel /api/runs → authenticated HTTPS → VPS backend
                                                  ├─ inventory HTTP
                                                  ├─ payment HTTP
                                                  ├─ delivery HTTP
                                                  └─ SQLite on persistent volume
```

## Current boundary

The backend, web proxy and workspace separation have been tested locally. A VPS address, SSH access and an HTTPS backend endpoint are needed to verify the live deployment. Do not describe the backend as deployed until those checks have actually passed.

Vercel does not provide a persistent local filesystem for SQLite; see its [SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel). We keep the database on the VPS and connect through the web app's server-side proxy.

## Backend on the VPS

Inspect the existing server before installing or restarting anything. In particular, check which processes own ports 80, 443 and 4320, whether Docker is installed, and whether an existing reverse proxy already serves other applications. Preserve those applications.

The repository includes `vps-backend/Dockerfile` and `vps-backend/compose.yaml`. From a checkout on the VPS:

```sh
# Supply BACKEND_TOKEN through a private environment file or secret manager.
docker compose -f vps-backend/compose.yaml up -d --build
```

`BACKEND_TOKEN` must be unique, at least 32 characters, and identical to the value set privately in Vercel. Never commit it, paste it into a public issue, or use the token from the test suite.

Compose exposes the backend at **127.0.0.1:4320 on the VPS**, not on the public network. Configure the server's existing HTTPS reverse proxy to forward a dedicated backend hostname to that port, without buffering streamed responses. Set a request body limit of about 2 KB, a request timeout of at least 30 seconds and a sensible public rate limit. Do not disable TLS certificate validation.

The three provider ports remain internal to the container. Reports live in the `rehearsal-data` named Docker volume, mounted at `/data`. Container recreation preserves that volume. `docker compose down -v` deletes it: do not use that command if reports need to survive. Back up the volume or use SQLite's backup mechanism before server maintenance.

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
- Recreate the backend container without removing its volume; verify completed history survives.
- Record the deployed Git commit and test results. Neither API Manager nor Ballerina should be marked connected unless separately verified.
