import { endpoints } from "@/lib/engine";
import { hosted, proxyBackend } from "@/lib/backend-proxy";
import { gatewayHeaders, gatewayServices, gatewayTransport } from "@/lib/gateway";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (hosted()) return proxyBackend(request, '/health');
  const services = await Promise.all(
    Object.entries(endpoints()).map(async ([name, url]) => {
      try {
        const r = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(1500),
          cache: "no-store",
          headers: await gatewayHeaders(name),
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
    transport: gatewayTransport(),
    gatewayServices: gatewayServices(),
    ballerina: false,
    location: 'local',
  });
}
