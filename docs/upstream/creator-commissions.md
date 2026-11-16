# Commission execution (T18 bounded slice)

The manager's Creator payments workspace journals only payable fundraising commissions from a current exact T17 approval. Leaderboard prize dispatch is deferred. Prize liabilities, results and owed history remain unchanged.

`commissionPayments:journal` authenticates the current campaign manager before retry lookup. It atomically saves immutable approved item snapshots, stable operation identity and T11 commission obligations before scheduling a worker. Duplicate/concurrent requests return the original execution. Restricted recipients stay reserved outside execution; resolving their recipient evidence requires refreshing and approving the exact batch again.

Creating a reservation changes the T17 batch fingerprint. Dispatch therefore uses the saved approval snapshot and independently validates its external inputs: original donation/correction/refund evidence, other commission obligations/payments, recipient evidence, current memberships, approving manager, cutoff and original transport. It does not compare the post-reservation batch fingerprint against the approval. New weekly preparations cannot duplicate the reserved or confirmed amounts.

The worker persists its claim before HTTP. Once claimed, every later attempt performs a lookup of the same identity, including after process interruption, timeout or authority revocation. Unknown outcomes never release reservations or cause a replacement POST. A confirmed nonsettlement remains failed and reserved; this slice provides no automatic replacement or destination rewrite. Changed destinations after journaling remain held for review. Authenticated conflicting terminal evidence holds the execution while preserving any immutable T11 payment.

Only an explicitly owned campaign and signed loopback transport can execute. The wire contract binds operation, campaign, nonprofit, creator, USD cents, source, destination and transport. Its `confirmed` status describes an owned ledger result, not actual Stripe or bank settlement. Synthetic T11 records retain that distinction. Production dispatch always remains held pending actual account/route validation under #66. Browser clients cannot select a transport, provide callbacks, override recipient evidence or mark payments paid.

Current managers see redacted history and same-identity reconciliation controls. Accepted creators see only their own itemized outcomes; destination/source bindings, other creators and privileged controls are omitted. Audit observations are append-only and retain actor/source/time/version and evidence digests.

Focused verification: `node --test tests/launch/commission-payments.test.ts` and `npx playwright test --config playwright.launch.config.ts tests/launch-browser/commission-payments.spec.ts`. Both join the existing final launch suites. Controlled worker suspension is an owned environment-only queue-outage test, never a browser or production capability.

Full T18 remains incomplete while #66 and deferred prize dispatch requirements remain open.
