# Verification record

Checked locally on 6 September 2026 using Node.js 24.11.0 on this Intel Mac.

| Check | Result | Scope |
| --- | --- | --- |
| HTTP engine tests | 10 passed | Four faults in baseline/recovery modes, concurrent isolation and unavailable-provider rejection |
| Browser tests | 4 passed | Chrome headless: baseline/recovery, event dialog, JSON download, history reload, comparison, other presets, mobile-width navigation and API input/origin validation |
| TypeScript | Passed | `tsc --noEmit` |
| Production build | Passed | `next build --webpack` |
| Production browser smoke test | Passed | Built app on loopback port 3041 completed a recovery run with 4/4 checks and no page errors |
| Launcher syntax | Passed | `zsh -n 'Start Rehearsal.command'`; a separate double-click launch was not performed while the app was already running |
| Documentation reader review | Passed with small setup clarifications | Run instructions, data lifecycle, recovery semantics and WSO2 evidence boundaries |

The browser suite uses a 1440-pixel desktop viewport and a 390-pixel mobile viewport, including reduced-motion mode. The mobile check is emulation, not a physical-device test. Safari and Firefox have not been tested.

Snapshots from the browser checks are saved locally as `work/studio-recovery.png` and `work/studio-mobile.png`. They show real UI state, not design mockups. Completed test runs remain in local history; the automated tests do not clear existing reports.

## Issues found while checking

- The dev server's host allowlist initially blocked its connection on 127.0.0.1. Both loopback hostnames are now explicitly allowed.
- Next normalized the server request URL to localhost. The run API now compares the incoming origin with the actual Host header and restricts browser origins to loopback.
- External font requests delayed the first render. Fonts and their licenses are now included in the project.
- Controls could be clicked before React attached their handlers. Initial navigation and scenario controls stay disabled until the UI is interactive.
- A null request body previously escaped the validation guard. It now receives HTTP 400 and has browser-API regression coverage.

## Not verified

WSO2 API Manager routing, gateway security/throttling, Ballerina execution, public deployment and upstream PR acceptance are not verified. The Ballerina distribution archive is downloaded under the ignored `work` folder, but downloading a runtime is not integrating it. No internship points are claimed by this record.
