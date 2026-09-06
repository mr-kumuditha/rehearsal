# WSO2 integration: honest boundaries

Rehearsal is intended to become a useful WSO2 integration example. The default application currently runs straight against its own HTTP sandbox. API Manager is not installed, started or verified by this project.

## API Manager: the next managed boundary

The proposed connection is straightforward: publish each sandbox provider as a managed API and route the runner through those APIs. The sandbox owns failure injection; the gateway owns the API security and throttling rules you configure.

For each provider, the contract is:

| Method and path | Input                                               | Output                                          |
| --------------- | --------------------------------------------------- | ----------------------------------------------- |
| GET /health     | No run ID required by the provider                  | Service name and sandbox mode                   |
| POST /execute   | `X-Rehearsal-Run` header; JSON `key` and `scenario` | Provider result, or a scenario-specific failure |
| GET /ledger     | `X-Rehearsal-Run` header                            | JSON `operations` array                         |

Preserve the run header, request body and Retry-After response header through the gateway. If API Manager runs inside a container, its upstream must reach the host's sandbox; `localhost` inside that container is not this Mac's loopback. The current providers bind to loopback for safety, so a container deployment needs a deliberate networking change. Do not widen that binding casually.

Once a gateway is running, copy `.env.example` to `.env.local`. Set the three service URLs to the published gateway API base paths, without a trailing slash, and provide `GATEWAY_TOKEN` server-side. Restart the app. Never commit the token or disable TLS validation to make a demo work; use a trusted local certificate configuration.

The app calls `/execute`, `/ledger` and `/health` beneath each configured base URL. A green health check means the endpoint responded, not that every gateway policy has been verified.

## Evidence required before calling API Manager integrated

1. Save the API definitions and documented gateway version/configuration without credentials.
2. Run a scenario through the gateway and retain a report plus gateway-side request evidence.
3. Demonstrate an invalid or missing token being rejected at the gateway.
4. Demonstrate a gateway-level rate limit independently of the sandbox's injected 429.
5. Re-run all four recovery scenarios and verify the business checks still hold.

These steps are not marked complete. Consult the [official API Manager documentation](https://apim.docs.wso2.com/) for the version you install.

## Ballerina

Ballerina is the planned integration runtime. The current TypeScript runner is useful on its own, but does not count as Ballerina execution. Any Ballerina component added here must be compiled, run against the sandbox and covered by evidence before the UI or CV describes it as live.

The first useful boundary is an independent ledger auditor: fetch the three provider ledgers using typed HTTP clients and return a typed summary. It should fail on unreadable or malformed data instead of trusting the runner's own claimed counts. Moving the orchestration itself to Ballerina is a separate milestone.

References: [Ballerina HTTP client data binding](https://ballerina.io/learn/by-example/http-client-data-binding/) and [Ballerina HTTP service data binding](https://ballerina.io/learn/by-example/http-service-data-binding/).
