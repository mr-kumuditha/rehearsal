export type ScenarioId =
  "lost-response" | "duplicate-event" | "rate-limit" | "invalid-response";
export type Strategy = "baseline" | "recovery";
export type Service = "inventory" | "payment" | "delivery" | "workflow";
export type RunEvent = {
  id: number;
  at: string;
  elapsed: number;
  service: Service;
  action: string;
  detail: string;
  status: "success" | "warning" | "error" | "info";
  code?: number;
};
export type Ledger = {
  reservations: number;
  authorizations: number;
  deliveries: number;
};
export type Check = {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
};
export type Run = {
  id: string;
  scenario: ScenarioId;
  strategy: Strategy;
  startedAt: string;
  duration: number;
  events: RunEvent[];
  ledger: Ledger;
  checks: Check[];
  outcome: "passed" | "failed";
  transport: "direct-http" | "gateway-configured";
};
export const scenarios: {
  id: ScenarioId;
  name: string;
  label: string;
  description: string;
  fault: string;
  recovery: string;
}[] = [
  {
    id: "lost-response",
    name: "Lost delivery response",
    label: "Response timeout",
    description:
      "Delivery is booked. The response never makes it back. Is it safe to try again?",
    fault:
      "Delivery commits, then delays its response beyond the client deadline.",
    recovery:
      "Reuse the same idempotency key and reconcile against the delivery ledger.",
  },
  {
    id: "duplicate-event",
    name: "Duplicate delivery event",
    label: "Repeated event",
    description:
      "One payment event arrives twice. Your delivery provider sees two requests.",
    fault: "The same delivery-triggering event is submitted twice.",
    recovery:
      "Bind both attempts to the same operation key; return the existing delivery.",
  },
  {
    id: "rate-limit",
    name: "Rate-limited delivery",
    label: "HTTP 429",
    description:
      "Payment clears just as the delivery API hits its request limit.",
    fault: "The first delivery attempt returns 429 with Retry-After: 1.",
    recovery: "Respect Retry-After and perform one bounded retry.",
  },
  {
    id: "invalid-response",
    name: "Unexpected payment response",
    label: "Schema mismatch",
    description:
      "Payment succeeds, but its response no longer matches your contract.",
    fault:
      "Payment returns authorization_reference instead of authorizationId.",
    recovery:
      "Reject the response shape, then query the payment ledger before proceeding.",
  },
];
