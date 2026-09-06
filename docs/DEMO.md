# A three-minute walkthrough

Use this as a structure, not a speech to memorize. Run both strategies once before recording so you know what the UI will show. Do not invent timing numbers; use the report from that run.

## The problem

“An order has been paid for, and the delivery API times out. Should we try again? That sounds simple, but the provider might already have booked the delivery. I built Rehearsal to make that uncertainty visible.”

Show the three providers and confirm the sandbox is online. Explain that these are local test services and no money is moving.

## The failure

Run **Lost delivery response → Baseline**. Point out the response deadline, the blind retry and the final delivery count. Open an event to inspect its timestamp and detail.

“The client did not receive a reply. It retried as a new operation. The provider ledger now shows two bookings for one paid order.”

## A better decision

Click **Run with recovery**. Explain that this is a fresh experiment with a separate ledger, not a repair of the previous run.

“This time both attempts use the same operation key. The provider recognizes the retry and returns the existing booking.”

Open **Compare strategies** and download one report. Show how the trace, ledger counts and checks support the outcome.

## The engineering boundary

“This prototype tests a fixed order contract over real HTTP. Provider ledgers are in memory and completed reports are saved locally. It demonstrates these specific recovery strategies; it does not prove every distributed system is safe.”

On the hosted demo, show the delivery gateway route: WSO2 API Manager authenticates requests before forwarding them to the sandbox. Show the separate token-rejection and quota checks in the verification record. Explain why those checks do not make a badly keyed retry safe. Inventory and payment still use direct HTTP, and Ballerina is not live. End with a concrete next step, such as durable provider idempotency storage.
