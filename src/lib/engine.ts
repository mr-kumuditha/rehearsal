import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { scenarios } from "./types.ts";
import type { Run, RunEvent, Service, ScenarioId, Strategy } from "./types.ts";

export const endpoints = () => ({
  inventory: process.env.INVENTORY_URL || "http://127.0.0.1:4311",
  payment: process.env.PAYMENT_URL || "http://127.0.0.1:4312",
  delivery: process.env.DELIVERY_URL || "http://127.0.0.1:4313",
});
export async function runRehearsal(
  scenario: ScenarioId,
  strategy: Strategy,
  onEvent?: (event: RunEvent) => void,
  bases = endpoints(),
): Promise<Run> {
  if (!scenarios.some((s) => s.id === scenario))
    throw new Error("Unknown scenario");
  const id = randomUUID();
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const events: RunEvent[] = [];
  const log = (
    service: Service,
    action: string,
    detail: string,
    status: RunEvent["status"],
    code?: number,
  ) => {
    const event = {
      id: events.length + 1,
      at: new Date().toISOString(),
      elapsed: Math.round(performance.now() - start),
      service,
      action,
      detail,
      status,
      ...(code ? { code } : {}),
    };
    events.push(event);
    onEvent?.(event);
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Rehearsal-Run": id,
  };
  if (process.env.GATEWAY_TOKEN)
    headers.Authorization = `Bearer ${process.env.GATEWAY_TOKEN}`;
  const call = async (
    service: keyof typeof bases,
    path: string,
    body?: unknown,
    timeout = 3000,
  ) =>
    fetch(`${bases[service]}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeout),
    });
  const execute = async (
    service: keyof typeof bases,
    key: string,
    timeout = 3000,
  ) => {
    log(service, "Request sent", `POST /execute · operation ${key}`, "info");
    const res = await call(service, "/execute", { key, scenario }, timeout);
    log(
      service,
      res.ok ? "Response received" : "Request rejected",
      `${res.status} ${res.statusText}`,
      res.ok ? "success" : "warning",
      res.status,
    );
    return res;
  };
  log(
    "workflow",
    "Rehearsal started",
    `${strategy === "baseline" ? "Baseline" : "Recovery"} strategy · real HTTP sandbox requests`,
    "info",
  );
  const stock = await execute("inventory", "reserve-stock");
  if (!stock.ok) throw new Error("Inventory unavailable");
  const payment = await execute("payment", "authorize-payment");
  if (!payment.ok) throw new Error("Payment unavailable");
  const payload = await payment.json();
  let contractHandled = true;
  if (
    typeof payload.authorizationId !== "string" ||
    typeof payload.amount !== "number"
  ) {
    log(
      "payment",
      "Contract mismatch",
      "Expected authorizationId:string and amount:number; received a different shape.",
      "error",
    );
    contractHandled = false;
    if (strategy === "recovery") {
      const response = await call("payment", "/ledger");
      if (!response.ok) throw new Error("Payment reconciliation unavailable");
      const data = await response.json();
      contractHandled =
        data.operations.length === 1 && data.operations[0].amount === 4800;
      log(
        "payment",
        "Payment reconciled",
        contractHandled
          ? "Ledger confirms one LKR 4,800 sandbox authorization. Continue without charging again."
          : "Unable to confirm authorization.",
        contractHandled ? "success" : "error",
      );
    } else
      log(
        "workflow",
        "Workflow stopped",
        "Payment cannot be confirmed from this response. Stock and payment remain committed.",
        "error",
      );
  }
  if (contractHandled) {
    const key = "book-delivery";
    try {
      let response = await execute(
        "delivery",
        key,
        scenario === "lost-response" ? 150 : 3000,
      );
      if (response.status === 429 && strategy === "recovery") {
        const delay =
          Math.min(3, Number(response.headers.get("Retry-After")) || 1) * 1000;
        log(
          "delivery",
          "Backoff scheduled",
          `Respecting Retry-After; waiting ${delay}ms before one retry.`,
          "warning",
        );
        await new Promise((r) => setTimeout(r, delay));
        response = await execute("delivery", key);
      }
      if (scenario === "duplicate-event") {
        log(
          "workflow",
          "Duplicate event received",
          "Re-delivering the same payment-completed event.",
          "warning",
        );
        const replay = await execute(
          "delivery",
          strategy === "recovery" ? key : randomUUID(),
        );
        const data = await replay.json();
        log(
          "delivery",
          data.replayed ? "Duplicate suppressed" : "Second delivery created",
          data.replayed
            ? "The operation key resolves to the existing delivery."
            : "A fresh key allowed another delivery for the same order.",
          data.replayed ? "success" : "error",
        );
      }
      if (!response.ok)
        log(
          "workflow",
          "Workflow incomplete",
          "Payment is authorized, but no delivery was booked.",
          "error",
        );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !["TimeoutError", "AbortError"].includes(error.name)
      )
        throw error;
      log(
        "delivery",
        "Response deadline exceeded",
        "150ms deadline reached. A timeout does not prove the operation failed.",
        "warning",
      );
      if (strategy === "recovery") {
        const response = await execute("delivery", key);
        if (!response.ok) throw new Error("Delivery retry failed");
        log(
          "delivery",
          "Delivery reconciled",
          "Same operation key returns the already-created delivery. No duplicate booking.",
          "success",
        );
      } else {
        log(
          "delivery",
          "Blind retry",
          "Retrying with a new operation key; the original outcome is still unknown.",
          "error",
        );
        try {
          await execute("delivery", randomUUID(), 150);
        } catch {
          log(
            "delivery",
            "Retry timed out",
            "Inspect the provider ledger to see what actually committed.",
            "error",
          );
        }
      }
    }
  }
  const counts = await Promise.all(
    (["inventory", "payment", "delivery"] as const).map(async (s) => {
      const response = await call(s, "/ledger");
      if (!response.ok) throw new Error(`${s} ledger unavailable`);
      const data = await response.json();
      return data.operations.length as number;
    }),
  );
  const ledger = {
    reservations: counts[0],
    authorizations: counts[1],
    deliveries: counts[2],
  };
  const checks = [
    {
      name: "Stock reserved once",
      passed: counts[0] === 1,
      expected: "1 reservation",
      actual: `${counts[0]} reservation(s)`,
    },
    {
      name: "Payment authorized once",
      passed: counts[1] === 1,
      expected: "1 authorization",
      actual: `${counts[1]} authorization(s)`,
    },
    {
      name: "One delivery per paid order",
      passed: counts[2] === 1,
      expected: "1 delivery",
      actual: `${counts[2]} delivery booking(s)`,
    },
    {
      name: "Payment outcome verified",
      passed: contractHandled,
      expected: "Confirmed authorization",
      actual: contractHandled
        ? "Confirmed authorization"
        : "Unresolved response contract",
    },
  ];
  const outcome = checks.every((x) => x.passed) ? "passed" : "failed";
  log(
    "workflow",
    "Business checks complete",
    `${checks.filter((x) => x.passed).length}/${checks.length} invariants hold. Provider ledgers inspected.`,
    outcome === "passed" ? "success" : "error",
  );
  return {
    id,
    scenario,
    strategy,
    startedAt,
    duration: Math.round(performance.now() - start),
    events,
    ledger,
    checks,
    outcome,
    transport: process.env.GATEWAY_TOKEN ? "gateway-configured" : "direct-http",
  };
}
