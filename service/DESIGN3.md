# OTP email relay — living design

## Purpose of this document

This document records the architecture we currently believe will work, the decisions that constrain implementation, and the risks that could invalidate those decisions.

It is not a complete implementation specification. Endpoint shapes, schemas, token formats, and other local mechanics are settled while building the slice that needs them. Working code and tests are expected to change this document.

The rule is: think through the whole system, but decide only what protects us from unsafe implementation or expensive rearchitecture.

## Goal and boundary

The relay is a free hosted OTP email sender. It lets an application send OTPs without opening an email-provider account or configuring DNS.

The application owns users, authentication policy, and OTP verification. The relay receives an API key, one recipient, and an OTP, then renders and sends its own fixed message.

The caller never controls the sender, subject, body, links, attachments, or branding. A compromised key can create unwanted OTP traffic, but it cannot carry arbitrary spam or phishing content.

The service stores delivery and abuse state. It never stores or logs OTP values.

## System shape

An application server calls the relay with its project key. The relay applies key state, recipient, volume, suppression, and global-cost policy before passing a fixed message to the email provider.

Human-facing pages handle activation, claiming, abuse reports, and recovery. They use Turnstile where automation resistance matters.

One relational database holds keys, recipient sets, counters, send history, ownership, and suppression. Email-provider lifecycle events feed reputation enforcement asynchronously.

## Core flows

### Provision and activate

Anyone may provision a key without an account or input. Provisioning returns a disabled key and an activation link; it sends no email.

A human opens the activation page, passes Turnstile, and explicitly activates the key. Activation establishes human participation, not inbox ownership.

Unactivated keys expire after seven days. Activated but unclaimed keys expire after thirty days of inactivity.

### Pin and send

The first valid send after activation pins the key to that exact recipient. Until claim, the key may send only to the pin. A key pinned to the wrong address is discarded and replaced.

Each normal OTP email sent before claim contains a claim link and an abuse-report link. There is no separate claim email.

### Claim

The claim link in the OTP email is a magic link. Possession of that link proves access to the pinned inbox; no second OTP is sent.

Automated link fetches must not claim the key. Claiming requires an explicit human action from the claim page, with Turnstile as automation resistance. The link supplies authority; Turnstile does not.

After claim, the canonical pin becomes the key's verified owner inbox. The verified inbox is the accountability, strike, and suspension unit. There are no user or organization accounts.

One verified inbox may own at most five active claimed keys.

### Send after claim

A claimed key may send to at most 100 recipient identities over its lifetime. The set is append-only. When full, existing recipients continue to work and new recipients are refused.

Every key may send up to 100 emails per day. A global daily allowance derived from an approximately $50 monthly provider budget bounds total cost across all keys.

Reaching the lifetime recipient limit means the application has graduated from the relay. The recovery is to replace the delivery adapter with its own sender, not to buy a higher tier.

### Report unwanted OTP

Every email contains a unique relay-owned “Report unwanted OTP” link. This is separate from the mailbox provider's spam button and from bounce handling. Its purpose is to stop unwanted traffic before the recipient reports the sending domain to Gmail or another provider.

Automated link fetches must not suppress an address. The report page explains the scope and requires an explicit confirmation.

A confirmed report globally suppresses that recipient from application-triggered relay mail. Future sends are silently dropped so the key holder cannot use the relay as a suppression oracle.

Reports against claimed keys count against the verified owner inbox. Enough reports suspend every key owned by that inbox. Reports against unclaimed keys need a policy before the reporting slice is implemented.

An accidental report must be reversible only through proof of control of the suppressed inbox. The exact recovery flow is intentionally deferred to the reporting slice.

### Provider bounces and complaints

The email provider separately suppresses hard bounces, repeated soft bounces, and provider-level spam complaints. These signals feed a fast automatic kill switch for the responsible key or owner inbox.

The relay's custom recovery flow must not override provider suppression. Provider-level removal follows the provider's rules and requires evidence that the recipient wants mail again.

## Load-bearing decisions

| Decision | Why it is architectural |
| --- | --- |
| Caller content is limited to a shape-checked OTP and one recipient | This closes the spam and phishing payload channel. |
| The key is the project; the verified inbox is the identity | Limits and enforcement need an accountable owner without introducing accounts. |
| Activation proves a human; claim proves inbox access | Combining them would either add an unnecessary email round trip or let an unverified address become the identity. |
| Claim uses the magic link already present in an OTP email | A second claim OTP duplicates the proof and complicates the flow. |
| Recipient reach, daily volume, and global cost have separate limits | Each bounds a different abuse dimension and is enforced over different state. |
| Recipient sets are append-only | Recycling slots would allow one key to rotate through unlimited victims. |
| Existing recipients keep working when a set is full | A bot filling the set must not sign out existing users. |
| Delivery uses the address as provided; counting and suppression use a conservative canonical identity | Alias variants must not bypass limits, but unsafe global normalization can merge different mailboxes. |
| Suppression is invisible to key holders | Observable suppression becomes an address-membership oracle. |
| Shared per-recipient OTP budgets are not used | An attacker could exhaust a victim's budget and block legitimate sign-in from another application. |
| Pinning, bounded-set insertion, counters, claiming, and suspension are atomic decisions | Read-then-write implementations fail under concurrency. |
| The relay does not trust caller-supplied end-user IPs | The relay sees application servers and cannot independently verify forwarded client identity. |
| OTP mail has its own sending subdomain | Reputation damage must not spread to the apex or future mail categories. |

## Current product limits

| Limit | Activated | Claimed |
| --- | --- | --- |
| Lifetime recipient set | Exact pin | 100 recipient identities, including the pin |
| Sends per key per day | 100 | 100 |
| Active claimed keys per verified inbox | — | 5 |
| Key expiry | 7 days unactivated; 30 days inactive after activation | None |

These values are public and configurable in source control. They may change when running software supplies evidence, but implementations must not quietly reinterpret them.

## Stack direction

- One TanStack Start application on Cloudflare Workers serves the API and human-facing pages.
- Neon Postgres behind Hyperdrive holds relational state; Smart Placement keeps production Workers near the database.
- Cloudflare Email Service sends from `otp.auth.ax`.
- Email lifecycle events arrive through a Cloudflare Queue and must be processed idempotently.
- Durable Objects remain an option if the global counter becomes a measured database hotspot.
- SES is the fallback provider. Provider-specific code stays behind one fixed-message send boundary.
- Cloudflare provides DDoS protection, managed WAF rules, edge rate limiting for provisioning, and Turnstile for human flows.

Cloudflare Email Service and its event path are new enough that they must be exercised under failure before the architecture depends on them.

## Architectural pressure tests

These scenarios must stay visible. A scenario is resolved before implementation only when it could change a boundary or invalidate the next slice.

| Scenario | Architectural constraint | When to resolve |
| --- | --- | --- |
| Two first sends race with different recipients | Exactly one pin may win. | Pinning slice; prove with a concurrent test. |
| Two claims race at the five-key owner cap | The cap cannot be exceeded. | Claim slice; prove the storage boundary. |
| Concurrent new recipients race at slot 100 | The set cannot exceed 100. | Claimed-send slice; prove the storage boundary. |
| A claim link is fetched by a preview bot | Fetching alone must not claim. | Claim slice. |
| A claim email is forwarded | The link is bearer authority, so forwarding delegates claim power. | Accepted property; make it explicit in UX. |
| Alias forms bypass recipient counting or suppression | Canonicalization must close known provider aliases without merging unrelated mailboxes. | Recipient-storage slice; test provider rules. |
| A bot fills a claimed key's recipient set through the application's signup flow | Slots cannot be recycled; re-keying is the recovery until verification feedback exists. | Key-management slice. |
| A report is accidental | Recovery requires inbox control and cannot be initiated by the sender. | Reporting slice; research and test the flow. |
| An unclaimed key receives a report | There is no verified inbox to strike. | Reporting slice; decide key-level containment. |
| Custom and provider suppression disagree | Provider suppression always wins. | Reporting/event slice. |
| Email events are duplicated, delayed, or lost | Enforcement must be idempotent and operationally observable. | Provider-event spike before public launch. |
| A claimed key is lost or leaked | Rotation, revocation, and owner recovery must preserve the five-key and strike model. | Key-management slice. |
| The lifetime recipient limit is surfaced through the auth library | A permanent graduation outcome must not masquerade as a temporary rate limit. | Delivery-adapter slice. |
| The global counter becomes hot | Correctness comes before optimization; move only after measuring contention. | Load testing. |
| Send history contains recipient data | Retention must support reports and provider events without becoming indefinite storage. | Data-model slice and privacy review. |
| Disposable inboxes multiply claimed keys | Blocking them may reject legitimate development and privacy use cases. | Measure after launch; do not guess. |
| The relay never sees OTP verification outcomes | Bot-triggered sends consume recipient slots even when no OTP is verified. | Accepted launch trade-off; revisit with verification feedback. |

## Incremental build

### Slice 1: walking skeleton

Build the smallest real path through provisioning, activation, first-send pinning, fixed rendering, Neon, and Cloudflare Email Service.

This slice proves the deployment, database placement, secret handling, provider handoff, and atomic pin. It is not public until cost and abuse safeguards are present.

### Slice 2: claim and claimed sending

Add the claim link already carried by OTP mail, verified inbox ownership, the five-key cap, and the 100-recipient append-only set.

Pressure-test claim and recipient-limit races. Update this document with decisions learned from the implementation.

### Slice 3: custom reporting

Add report confirmation, global custom suppression, strikes, suspension, and recipient-controlled recovery.

Settle only the report-specific questions at this point: unclaimed-key handling, accidental-report recovery, strike calculation, and required history.

### Slice 4: provider reputation loop

Ingest bounce and complaint events, deduplicate them, mirror provider suppression, and exercise the automatic kill switch under delayed, duplicated, and failed delivery.

Do not trust this path until failure tests show that it contains abusive keys quickly.

### Slice 5: library adapter

Connect the service to the auth library. Settle how temporary rate limits, permanent graduation, silent suppression, and infrastructure failure appear through the delivery contract.

### After every slice

1. Revisit the pressure tests adjacent to that slice.
2. Resolve or spike only what blocks safe implementation.
3. Implement the vertical path and its necessary tests.
4. Record durable decisions and remove disproven assumptions.
5. Leave local mechanics in code and exact behavior in tests.

## Intentionally deferred

The architecture does not currently require decisions about:

- exact endpoint names, request bodies, or HTTP status mapping;
- database tables, columns, indexes, or transaction syntax;
- token representation and precise token lifetimes;
- exact claim, report, and recovery page mechanics beyond the security constraints above;
- exact strike and provider kill-switch formulas;
- send-history retention duration;
- key-recovery UX when the current secret is unavailable;
- internationalized email support;
- a disposable-domain policy; or
- whether a hot counter eventually moves to Durable Objects.

These become design questions when their implementation slice approaches. If a spike shows that one changes a current boundary, it is promoted into the load-bearing decisions.

## Public-launch gates

Before public traffic:

- the complete provision → activate → pin → claim → multi-recipient flow works through the deployed stack;
- concurrency tests prove every atomic limit boundary;
- custom reports stop further email without exposing suppression;
- accidental custom suppression has a recipient-controlled recovery path;
- provider bounce and complaint events have been exercised under failure and duplication;
- key, recipient, daily, and global cost limits fail closed;
- leaked keys can be revoked;
- reputation and budget alerts reach an operator; and
- the delivery adapter distinguishes retryable failure from permanent graduation.

## Later

- Verification-outcome feedback so recipient slots can reflect completed authentication rather than attempted sends.
- Optional end-user IP forwarding for honest applications.
- A higher daily key limit if real applications repeatedly reach 100 sends.
- An inbox-authenticated management surface, potentially dogfooding the auth library.
- SMS delivery.
