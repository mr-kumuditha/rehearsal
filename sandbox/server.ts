import { createServer } from "node:http";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

type Operation = { id: string; key: string; amount?: number };
type State = { operations: Operation[]; attempts: number };
export async function startSandbox(ports = [4311, 4312, 4313]) {
  const servers: Server[] = [];
  const states = ["inventory", "payment", "delivery"].map(
    () => new Map<string, State>(),
  );
  for (const [index, kind] of ["inventory", "payment", "delivery"].entries()) {
    const server = createServer(async (req, res) => {
      const send = (code: number, body: unknown, headers = {}) => {
        if (!res.destroyed) {
          res.writeHead(code, {
            "Content-Type": "application/json",
            ...headers,
          });
          res.end(JSON.stringify(body));
        }
      };
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health")
        return send(200, { service: kind, mode: "sandbox" });
      const scope = req.headers["x-rehearsal-run"];
      if (typeof scope !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(scope))
        return send(400, { error: "Valid X-Rehearsal-Run required" });
      const map = states[index];
      if (!map.has(scope)) {
        if (map.size >= 2000) map.delete(map.keys().next().value!);
        map.set(scope, { operations: [], attempts: 0 });
      }
      const state = map.get(scope)!;
      if (req.method === "GET" && url.pathname === "/ledger")
        return send(200, { operations: state.operations });
      if (req.method !== "POST" || url.pathname !== "/execute")
        return send(404, { error: "Route not found" });
      try {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 4096)
            return send(413, { error: "Payload too large" });
        }
        const body = JSON.parse(raw);
        if (!body.key || typeof body.key !== "string")
          return send(400, { error: "Operation key required" });
        const existing = state.operations.find((x) => x.key === body.key);
        const response = (op: Operation) =>
          kind === "payment"
            ? { authorizationId: op.id, amount: op.amount }
            : { id: op.id };
        if (existing)
          return send(200, { ...response(existing), replayed: true });
        state.attempts++;
        if (
          kind === "delivery" &&
          body.scenario === "rate-limit" &&
          state.attempts === 1
        )
          return send(
            429,
            { error: "Sandbox quota reached" },
            { "Retry-After": "1" },
          );
        const operation = {
          id: randomUUID(),
          key: body.key,
          ...(kind === "payment" ? { amount: 4800 } : {}),
        };
        state.operations.push(operation);
        if (kind === "delivery" && body.scenario === "lost-response")
          await new Promise((r) => setTimeout(r, 650));
        if (kind === "payment" && body.scenario === "invalid-response")
          return send(200, { authorization_reference: operation.id });
        send(201, response(operation));
      } catch {
        send(400, { error: "Invalid request body" });
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(ports[index], "127.0.0.1", resolve);
    });
    servers.push(server);
  }
  return {
    close: async () => {
      await Promise.all(
        servers.map(
          (s) =>
            new Promise<void>((r) => {
              s.closeAllConnections();
              s.close(() => r());
            }),
        ),
      );
    },
    servers,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startSandbox()
    .then(() =>
      console.log(
        "Rehearsal sandbox: inventory :4311, payment :4312, delivery :4313 (loopback only)",
      ),
    )
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
