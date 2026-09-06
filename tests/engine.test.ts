import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSandbox } from "../sandbox/server.ts";
import { runRehearsal } from "../src/lib/engine.ts";
import { scenarios } from "../src/lib/types.ts";
let sandbox: Awaited<ReturnType<typeof startSandbox>>;
const bases = {
  inventory: "http://127.0.0.1:14311",
  payment: "http://127.0.0.1:14312",
  delivery: "http://127.0.0.1:14313",
};
before(async () => {
  sandbox = await startSandbox([14311, 14312, 14313]);
});
after(async () => {
  await sandbox.close();
});
for (const scenario of scenarios) {
  test(`${scenario.id}: baseline reveals a broken business invariant`, async () => {
    const run = await runRehearsal(scenario.id, "baseline", undefined, bases);
    assert.equal(run.outcome, "failed");
    assert.equal(run.ledger.authorizations, 1);
    assert.equal(
      run.ledger.deliveries,
      ["lost-response", "duplicate-event"].includes(scenario.id) ? 2 : 0,
    );
    assert.ok(run.events.some((e) => e.status === "error"));
  });
  test(`${scenario.id}: recovery leaves exactly one stock reservation, payment, and delivery`, async () => {
    const run = await runRehearsal(scenario.id, "recovery", undefined, bases);
    assert.equal(run.outcome, "passed");
    assert.deepEqual(run.ledger, {
      reservations: 1,
      authorizations: 1,
      deliveries: 1,
    });
    assert.ok(run.checks.every((c) => c.passed));
    if (scenario.id === "rate-limit")
      assert.ok(run.duration >= 1000, "Retry-After must be respected");
  });
}
test("concurrent runs keep provider ledgers isolated", async () => {
  const runs = await Promise.all([
    runRehearsal("duplicate-event", "baseline", undefined, bases),
    runRehearsal("duplicate-event", "recovery", undefined, bases),
  ]);
  assert.notEqual(runs[0].id, runs[1].id);
  assert.equal(runs[0].ledger.deliveries, 2);
  assert.equal(runs[1].ledger.deliveries, 1);
});
test("an unavailable provider cannot produce a passing run", async () => {
  await assert.rejects(
    runRehearsal("lost-response", "recovery", undefined, {
      ...bases,
      inventory: "http://127.0.0.1:1",
    }),
  );
});
