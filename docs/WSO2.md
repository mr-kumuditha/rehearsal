# WSO2: a real boundary in a small experiment

The hosted Rehearsal runner sends delivery requests through **WSO2 API Manager 4.7.0**. Inventory and payment still use direct HTTP. A default local checkout needs no WSO2 installation and uses all three providers directly.

```text
Vercel → authenticated VPS backend
                         ├─ HTTP → inventory :4311
                         ├─ HTTP → payment :4312
                         └─ HTTPS + OAuth → WSO2 :8243 → HTTP → delivery :4313
```

The gateway handles authentication, subscriptions and an independently tested quota. The sandbox handles failure injection and deduplication. An authenticated retry can still create a duplicate if the caller changes its operation key.

## The two managed APIs

| API | Context and version | Contract | API quota |
| --- | --- | --- | --- |
| RehearsalDelivery | `/rehearsal/delivery/1.0.0` | GET /health, POST /execute, GET /ledger | Unlimited; outer proxy/backend limits still apply |
| RehearsalGatewayProbe | `/rehearsal/gateway-probe/1.0.0` | GET /health only | RehearsalProbe2PerMin: two requests per minute |

Both reach the delivery sandbox at `http://127.0.0.1:4313`. The read-only probe never books a delivery or consumes the main API's quota. Throttle decisions propagate asynchronously; the verification script permits a bounded series of requests instead of assuming an exact rejection index.

[OpenAPI definitions and scripts](../integrations/wso2) preserve the run header, JSON operation key and provider Retry-After response. Payment schema validation remains a separate runner experiment.

## Reproduce the private deployment

This is a single-node portfolio demo, not an enterprise production installation. It uses API Manager's bundled H2 databases, Java 21 and a dedicated Linux account. The current host has 4 GB RAM and two CPUs; the Java heap is capped at 2 GB and its systemd service at 3 GB.

1. Inspect the host and preserve existing services. Download the official [API Manager 4.7.0 distribution](https://github.com/wso2/product-apim/releases/tag/v4.7.0) and a supported Java 21 runtime. Verify their published checksums. Extract to `/opt/wso2/wso2am-4.7.0` and `/opt/wso2/java`.
2. Create the `wso2` system account and protect its ports before startup. The current VPS allows public SSH, HTTP and HTTPS only; ports 9443, 8243 and 8280 are private. Providers bind to loopback.
3. For a **fresh installation only**, run `configure-runtime.mjs` as root. It refuses to overwrite existing credentials and generates private passwords, an encryption key and a unique localhost certificate, also imported into WSO2's client truststore. Make the product directory owned by wso2, its database directory mode 0700, and its keystore/configuration mode 0600. Never run the initializer over an existing database.
4. Install `wso2-apim.service`, reload systemd and start it. Check startup logs and the HTTPS publisher endpoint with the generated certificate. Systemd's active state alone is not readiness.
5. Put both OpenAPI files beside `provision.mjs` on the VPS. Export `NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/rehearsal-apim.crt` **before** starting Node. Run the provisioner to create the APIs, revisions, quota policy, subscriptions and RehearsalRuntime application.
6. With the same exported certificate path, run `node --env-file=/etc/rehearsal/gateway.env integrations/wso2/verify.mjs`. Connect the backend only after the checks pass.
7. Deploy the backend with its checked-in systemd unit. It loads the optional private gateway environment file. Restart rehearsal.service, then repeat public acceptance checks.

Loading NODE_EXTRA_CA_CERTS only through Node's --env-file did not establish trust during our checks; export it before starting Node. TLS verification is never disabled.

The provisioner follows WSO2's [REST API guide](https://apim.docs.wso2.com/en/latest/reference/product-apis/overview/) using Publisher v4, Developer Portal v3 and Admin v4. It saves resumable state, not a full configuration reconciliation plan. Existing recorded revisions are preserved: review and deploy a new revision explicitly after changing a definition or policy. A second clean-server installation has not yet been tested.

## Credentials and maintenance

- Root-only `/etc/rehearsal/apim-admin.env` and `apim-provision.json` contain control-plane credentials; the runner does not load them.
- Root-only `gateway.env` contains the runtime client ID/secret. Systemd reads it before dropping to the rehearsal user. These credentials never reach Vercel or the browser.
- The runner uses OAuth client credentials, refreshes before expiry and shares concurrent refreshes. Failure does not fall back to unauthenticated execution. Direct inventory/payment requests do not receive the bearer token.
- The runtime application is separate from the provisioning client but currently owned by the bootstrap administrator. A dedicated subscriber identity and reviewed scope restrictions remain hardening work; enterprise least privilege is not claimed.
- The first live startup generated a random symmetric key in deployment.toml. It is preserved with mode 0600. The initializer now supplies a private key before first startup on fresh hosts. Follow [WSO2's key migration guidance](https://apim.docs.wso2.com/en/latest/install-and-setup/setup/security/encryption/symmetric-encryption/) before changing a live key.
- Back up databases, keystores, configuration and private credentials together using an application-consistent procedure. No off-server backup schedule or restore test exists yet.
- The localhost certificate lasts 365 days from installation. Renewal is manual, separate from public HTTPS's Certbot timer. Renew/import it and update Node's trust file before expiry.

## Evidence and limits

On 7 September 2026 in Sri Lanka (6 September UTC), the gateway rejected missing credentials with 401/code 900902 and an invalid token with 401/code 900901. A valid token returned delivery health 200. The separate quota returned WSO2 429/code 900800 while the direct provider and main delivery API remained healthy.

The injected provider 429 preserved Retry-After: 1. Retry followed by replay committed one delivery. Gateway access logs recorded the managed execute, ledger and probe paths. Status assertions come from client checks; the default gateway log did not include useful status values for every entry. [VERIFICATION.md](VERIFICATION.md) records public end-to-end results.

A report's gateway-configured transport describes routing, not certification of every policy. Historical direct-http reports remain unchanged.

## Ballerina is a separate milestone

The runner remains TypeScript. No Ballerina component executes in the live request path. A useful next boundary is an independent typed ledger auditor, compiled and tested against real responses. Downloading a runtime or naming it in the interface is not integration.
