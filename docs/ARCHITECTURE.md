# How Rehearsal works

## Start with the business outcome

An HTTP timeout tells the caller that it did not receive a response in time. It does not tell the caller whether the provider committed an operation. Rehearsal makes that uncertainty visible using a deliberately small order flow.

```text
Browser studio
    │ POST /api/runs → streamed events → completed report
    ▼
TypeScript workflow runner ───────────────► SQLite report history
    │
    ├── HTTP → inventory :4311 → per-run reservation ledger
    ├── HTTP → payment   :4312 → per-run authorization ledger
    └── HTTP → delivery  :4313 → per-run booking ledger
```

These are three HTTP listeners in one sandbox process, not three independently deployed microservices. That keeps the project easy to run while preserving real request, timeout and retry behavior.

## Following a run

The API validates the selected scenario and strategy. The runner generates a UUID and sends it as `X-Rehearsal-Run` on every provider request. Each provider keeps a separate ledger for that ID.

Stock is reserved first, then a fixed LKR 4,800 sandbox payment is authorized. Delivery runs only after the runner accepts or reconciles the payment result. Events stream to the browser as newline-delimited JSON. A final message contains the report, which is also written to SQLite.

The checks inspect operation counts and the payment confirmation decision. They expect one stock reservation, one payment authorization, one delivery and a verified payment outcome. This is a one-order sandbox, so count checks are sufficient for its contract. A multi-order system would need to verify order references, amounts and relationships—not just counts.

## Where the fault lives

Faults are injected by our providers. The timeout case writes a booking synchronously and then waits 650 ms before replying; the client gives up after 150 ms. This ordering is important. If we delayed before committing, we would be testing a different problem.

Idempotency keys are scoped to a provider and run. The provider checks and inserts synchronously before awaiting anything. That makes duplicate suppression deterministic in this single-process implementation. It is not a substitute for a database uniqueness constraint across replicas.

The rate-limit case returns 429 on the first delivery attempt only. Recovery waits one second and retries once. This is a sandbox policy, not a verified WSO2 gateway policy. Payment schema recovery queries a trusted ledger; it does not guess that malformed data means success.

## Why these choices

**HTTP over fake trace data.** A recorded animation could explain the story, but it could not test the actual deadline or reveal duplicate side effects.

**SQLite for evidence.** A local project should not require a database account before its first run. The reports are durable; the sandbox state is intentionally disposable. SQLite uses Node 24's built-in module.

**A fixed contract first.** Allowing arbitrary URLs would turn a safe local exercise into a tool that can send failure traffic to unrelated systems. URLs are server configuration, not user input. Keep them pointed at services you own and have permission to test.

**No automatic rollback claim.** A failed baseline can leave stock and payment committed. The UI should show this, not hide it with an invented success. Compensation and durable recovery are later work.

## Operational boundaries

- There is no user authentication. Keep the app bound to loopback; do not expose it through a public tunnel.
- Provider state is capped at 2,000 run IDs per provider. The oldest scope is evicted after the cap. This is a local memory bound, not durable retention.
- SQLite stores completed reports without an automatic deletion policy. The UI returns the newest 100. Reports may be exported before archiving the database manually.
- A disconnected browser does not cancel an in-flight run. It can finish and persist; check history before retrying.
- A network error that prevents ledger inspection does not become a green report. The API sends an error and does not persist a completed result.
- Gateway credentials remain server-side and must never appear in reports, browser state or a repository.

## Reading the source

`sandbox/server.ts` owns provider behavior. `src/lib/engine.ts` owns workflow decisions. `src/lib/store.ts` owns report persistence. `src/app/api/runs/route.ts` owns input validation and event streaming. `src/app/page.tsx` presents the lab. Tests exercise the runner across actual loopback HTTP calls.
