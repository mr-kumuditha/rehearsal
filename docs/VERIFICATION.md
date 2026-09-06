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

## Issues found while checking

- The dev server's host allowlist initially blocked its connection on 127.0.0.1. Both loopback hostnames are now explicitly allowed.
- Next normalized the server request URL to localhost. The run API now compares the incoming origin with the actual Host header and restricts browser origins to loopback.
- External font requests delayed the first render. Fonts and their licenses are now included in the project.
- Controls could be clicked before React attached their handlers. Initial navigation and scenario controls stay disabled until the UI is interactive.
- A null request body previously escaped the validation guard. It now receives HTTP 400 and has browser-API regression coverage.

## Not verified

WSO2 API Manager routing, gateway security/throttling, Ballerina execution and upstream PR acceptance are not verified. The Ballerina distribution archive is downloaded under the ignored `work` folder, but downloading a runtime is not integrating it. No internship points are claimed by this record.
