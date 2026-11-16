# Campaign advertising contributions

Advertising contributions support the selected nonprofit campaign's advertising purpose. The public flow requires no account. The initial rollout offers adoption.is only.

The contributor cannot select an ad or route the contribution to another nonprofit. Campaign baseline and boost rules control advertising allocations.

Actual provider fees reduce the contribution. Slander adds no application fee. The contribution creates no creator commission, performance-bonus replenishment, public fundraising score, or advertising continuation score credit.

## Collection records

The server journals the immutable checkout before it sends the provider request. Exact retries retain the same operation, amount, scope, token capability, and provider key. Changed retry contents fail.

The adapter verifies the webhook signature and retrieves the canonical event, checkout session, PaymentIntent, charge, and expanded balance transaction. The records must match the original nonprofit, campaign, purpose, provider account, USD amount, and object references.

Confirmed gross, actual provider fees, and net collection have separate records. Unknown fees leave net collection unknown. Pending settlement creates no available collection. A negative provider net remains a visible deficit.

Browser return, pending events, failed events, and duplicate callbacks cannot create funds. Late actual fee evidence can complete unknown fee records once. Changed actual fee identities fail.

Verified refund, dispute, application-fee, routing, or conflicting financial evidence holds collection availability. The original gross, fee, and net records remain intact. T23 has no operation that releases a financial hold. Later or delayed healthy receipts cannot release it. Dedicated reconciliation work must approve any release.

The manager can inspect classified checkout states and contribution history through current campaign permissions. Public status requires the original checkout capability. Status responses omit provider account details and private routing data.

## Issuing and real-provider limits

Provider collection does not establish approved Issuing availability. This slice changes no allocation authority, baseline reserve, safety reserve, contractual performance-bonus obligation, or creator commission reserve.

The bounded adapter accepts only the owned localhost fixture. It cannot contact Stripe or activate real intake. Actual program/account approval and collection-route evidence remain gated by issues #20 and #21. Actual financial safety values remain outside T23.

The [Stripe balance transaction reference](https://docs.stripe.com/api/balance_transactions/object) defines separate amount, fee, net, and settlement-status fields. The [Stripe webhook guide](https://docs.stripe.com/webhooks) documents signature verification and duplicate or unordered delivery. The fixture exercises those selected shapes. It does not prove actual account approval, fee amounts, or settlement behavior.

## Verification

Run the focused backend checks with:

```text
node --test --test-concurrency=1 --test-reporter=tap tests/launch/advertising-contributions.test.ts
```

Run the desktop and mobile checks with:

```text
npx playwright test --config playwright.launch.config.ts tests/launch-browser/advertising-contributions.spec.ts
```

The backend checks cover canonical reference denials, actual fee accounting, concurrent retries, delayed receipts, financial holds, privacy, and a real backend restart. They also compare existing tracked donations, commissions, public standings, continuation inputs, performance-bonus records, reservations, and authority before and after contributions.

Each browser journey owns its backend and Vite server. The journey covers public disclosures, pending browser return, unknown fees, actual fees and net, reconciliation holds, uncertain retries, failed confirmation, manager classification, denied access, and blocked real intake.

Vocabulary was checked against the rulings and patterns in the ASD-STE100 skill only, not against the official ASD-STE100 dictionary. Full STE compliance has not been verified.
