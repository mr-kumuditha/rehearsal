# Verification record

Checked locally on 6 September 2026 using Node.js 24.11.0 on this Intel Mac.

| Check | Result | Scope |
| --- | --- | --- |
| HTTP engine tests | 10 passed | Four faults in baseline/recovery modes, concurrent isolation and unavailable-provider rejection |
| Hosted backend tests | 7 passed | Credential checks, streamed recovery, workspace isolation, persistence, concurrent execution rejection and web proxy/origin behavior |
| Browser tests | 4 passed | Chrome headless: baseline/recovery, event dialog, JSON download, history reload, comparison, other presets, mobile-width navigation and API input/origin validation |
| TypeScript | Passed | `tsc --noEmit` |
| Production build | Passed | `next build --webpack` |
| Production browser smoke test | Passed | Built app on loopback port 3041 completed a recovery run with 4/4 checks and no page errors |
| Launcher syntax | Passed | `zsh -n 'Start Rehearsal.command'`; a separate double-click launch was not performed while the app was already running |
| Documentation reader review | Passed with small setup clarifications | Run instructions, data lifecycle, recovery semantics and WSO2 evidence boundaries |

The browser suite uses a 1440-pixel desktop viewport and a 390-pixel mobile viewport, including reduced-motion mode. The mobile check is emulation, not a physical-device test. Safari and Firefox have not been tested.

Snapshots from the latest browser checks are saved locally as `work/studio-recovery.png` and `work/studio-mobile.png`. These now show the public hosted runtime. They show real UI state, not design mockups. Automated tests create sandbox reports in their own workspaces and do not clear existing reports.

## Public deployment checked on 6 September 2026

The public app is [rehearsal-kumuditha.vercel.app](https://rehearsal-kumuditha.vercel.app). The backend runs Node.js 24.20.0 on Ubuntu 22.04 at the documented DigitalOcean endpoint. The tested web code is `11b4180`; the native backend release is `def6b05`. Subsequent documentation commits do not change either runtime's behavior.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| GitHub-triggered Vercel production build | Ready | Build completed and the public alias served the hosted runtime |
| Hosted provider health | Passed | Inventory, payment and delivery reported online through Vercel `/api/health` |
| All four baseline/recovery pairs | Passed | Eight public API runs: each baseline failed its business checks and each recovery passed; all reports identified real direct HTTP execution |
| Public browser suite | 4 passed | Desktop experiment, event detail dialog, report export, comparison, history reload, other recovery presets, mobile layout/reduced motion, input and origin rejection |
| Workspace separation | Passed | Eight saved reports were returned to their originating workspace; a fresh visitor received an empty history |
| Restart persistence | Passed | The same eight report IDs remained available through Vercel after restarting `rehearsal.service` |
| Backend credential boundary | Passed | Direct unauthenticated `/runs` request returned 401; `/ready` returned 200 |
| HTTPS | Passed | Public requests validated the certificate normally, without disabling verification |
| Certificate renewal | Dry run passed | Certbot simulated renewal successfully; the timer is enabled and a proxy-reload hook is installed |
| Native service isolation | Checked | Non-root service account, loopback listeners, root-only credential file and report directory owned by `rehearsal` |

The backend service is capped at 192 MB and starts on boot. A full VPS reboot, Docker deployment, sustained load test and restore from an off-server backup have not been performed. Reports persist on the VPS disk, but no off-server backup schedule has been configured. The demo hostname depends on sslip.io DNS. See [deployment and maintenance](DEPLOYMENT.md).

## WSO2 deployment checked on 7 September 2026 (Sri Lanka)

API Manager 4.7.0 and Java 21 run on the upgraded 4 GB VPS. Backend source release `7a9ee7d` routes delivery through the private HTTPS gateway; the Vercel deployment of the same commit succeeded. Inventory/payment remain direct. Dates in gateway logs use UTC, where these checks occurred on 6 September.

| Check | Result | Scope |
| --- | --- | --- |
| Local automated tests | 22 passed | Previous 17 checks plus five OAuth routing, refresh, expiry and failure tests |
| TypeScript and production build | Passed | Local Node 24.11.0, webpack build |
| Public browser suite | 4 passed | Actual gateway-backed runs, trace dialog, export, comparison, history reload, mobile overflow and reduced motion |
| GitHub CI | Passed | Automated workflow on runtime commit 7a9ee7d |
| Missing gateway token | 401, code 900902 | Private managed delivery health endpoint |
| Invalid gateway token | 401, code 900901 | Same endpoint, deliberately invalid test token |
| Valid client-credentials token | 200 | Reached delivery sandbox through API Manager |
| Provider quota preservation | 429, Retry-After: 1 | Injected sandbox error retained through the gateway |
| Operation-key replay | One committed delivery | Initial quota rejection, successful retry, then replay of the same key |
| Separate gateway quota | 429, code 900800 | Read-only two-per-minute probe; direct provider and main delivery API still returned 200 |
| Gateway-side evidence | Paths recorded | HTTP access log includes managed execute, ledger and probe requests; client assertions supply status evidence |
| Public baseline/recovery pairs | Eight expected outcomes | Each baseline failed, each recovery passed, and every report used gateway-configured transport |
| Visitor separation | Passed | Eight reports visible only in their originating workspace |
| Backend restart persistence | Passed | Same eight report IDs remained after restarting rehearsal.service |
| Provisioning rerun | Passed | Existing APIs, revisions, application and subscriptions reused without duplication |

Reproduce the gateway checks on the VPS with `integrations/wso2/verify.mjs`, following [the certificate/environment instructions](WSO2.md). Run `node scripts/verify-hosted.mjs` from a checkout for the eight public scenarios. It writes a private workspace cookie under ignored `work/`; never publish that file. After an authorized backend restart, its `--after-restart` flag checks the original report IDs again. These scripts create only isolated sandbox operations.

The public firewall allows 22/80/443; WSO2 ports are private. API Manager is a single-node H2-backed demo, not a high-availability production service. No external load test, off-server backup restore, dedicated subscriber-role hardening or full reboot of the newly installed gateway has been verified.

## Issues found while checking

- The dev server's host allowlist initially blocked its connection on 127.0.0.1. Both loopback hostnames are now explicitly allowed.
- Next normalized the server request URL to localhost. The run API now compares the incoming origin with the actual Host header and restricts browser origins to loopback.
- External font requests delayed the first render. Fonts and their licenses are now included in the project.
- Controls could be clicked before React attached their handlers. Initial navigation and scenario controls stay disabled until the UI is interactive.
- A null request body previously escaped the validation guard. It now receives HTTP 400 and has browser-API regression coverage.

## Not verified

Ballerina execution, a second clean-server gateway installation and upstream PR acceptance remain unverified. The Ballerina archive is under ignored `work`, but downloading a runtime is not integrating it. No internship points are claimed by this record; WSO2 decides eligibility.
