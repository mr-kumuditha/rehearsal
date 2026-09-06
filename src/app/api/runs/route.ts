import { runRehearsal } from "@/lib/engine";
import { listRuns, saveRun } from "@/lib/store";
import { hosted, proxyBackend, sameOrigin } from "@/lib/backend-proxy";
import { scenarios } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (hosted()) return proxyBackend(request, "/runs");
  return Response.json(listRuns());
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error: "Cross-origin runs are not allowed"}, {status:403});
  if (hosted()) return proxyBackend(request, "/runs");
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !input ||
    typeof input !== "object" ||
    !scenarios.some((s) => s.id === input.scenario) ||
    !["baseline", "recovery"].includes(input.strategy)
  )
    return Response.json(
      { error: "Choose a valid scenario and strategy" },
      { status: 400 },
    );
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let disconnected = false;
      const send = (data: unknown) => {
        if (!disconnected)
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch {
            disconnected = true;
          }
      };
      try {
        const run = await runRehearsal(
          input.scenario,
          input.strategy,
          (event) => send({ type: "event", event }),
        );
        saveRun(run);
        send({ type: "result", run });
      } catch {
        send({
          type: "error",
          message:
            "Could not complete the run. Check that all sandbox services are running (npm run dev). No result was saved.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* Client may have disconnected. The run still finishes and persists. */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
