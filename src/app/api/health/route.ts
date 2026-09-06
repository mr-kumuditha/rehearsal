import { endpoints } from "@/lib/engine";
import { hosted, proxyBackend } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (hosted()) return proxyBackend(request, '/health');
  const services = await Promise.all(
    Object.entries(endpoints()).map(async ([name, url]) => {
      try {
        const r = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(1500),
          cache: "no-store",
          headers: process.env.GATEWAY_TOKEN
            ? { Authorization: `Bearer ${process.env.GATEWAY_TOKEN}` }
            : {},
        });
        const address = new URL(url);
        return {
          name,
          online: r.ok,
          address: address.origin + address.pathname,
        };
      } catch {
        return { name, online: false, address: "Check server configuration" };
      }
    }),
  );
  return Response.json({
    services,
    transport: process.env.GATEWAY_TOKEN ? "gateway-configured" : "direct-http",
    ballerina: false,
    location: 'local',
  });
}
