# OTP email relay

> **Status:** Candidate replacement for `DESIGN.md`. This document is normative except for sections explicitly marked **Open decision**.

## Purpose

The relay is a free hosted delivery adapter for OTP email. It lets an application send OTPs without creating an account, configuring DNS, or opening an email-service-provider account.

The application generates and verifies the OTP. The relay accepts only:

- one API key;
- one bare email address; and
- one six-digit OTP.

The relay owns the sender, subject, HTML, plain-text body, and footer. The caller cannot add an application name, text, links, headers, attachments, or any other content.

This is the central security property: a leaked or malicious key can create unwanted OTP traffic, but it cannot carry spam, phishing, or arbitrary payloads.

## Security invariants

1. **The content channel is closed.** The only caller-controlled message value is an OTP matching `^[0-9]{6}$`.
2. **A send has one recipient.** Display names, address lists, comments, CC, BCC, and newline characters are rejected.
3. **Delivery and suppression are not oracles.** Recipient-specific outcomes return `202 Accepted` whether the email is handed to the provider or silently suppressed. A non-recipient-specific infrastructure failure may return `503`.
4. **Reach, volume, and cost are independent bounds.** The recipient set bounds reach, the daily key limit bounds volume, and the global provider budget bounds cost.
5. **Inbox access is the authority for claiming a key.** The claim link in an ordinary OTP email is a magic link. There is no separate claim OTP and no second claim email.
6. **Every state transition that enforces a limit is atomic.** Pinning, recipient insertion, counters, claiming, reporting, and suspension must not use read-then-write logic.
7. **Keys are backend bearer secrets.** Possession authorizes sending and key rotation. Keys must never be embedded in browser code.
8. **OTP values are ephemeral.** They are used to render the email and are never stored or logged.

## Vocabulary

- **Key:** A project-scoped bearer credential used by the delivery adapter.
- **Pin:** The exact first recipient submitted after activation. Before claim, the key may send only to this exact address.
- **Owner inbox:** The canonical form of the pin after the key is claimed. It is the accountability and suspension unit.
- **Recipient identity:** The canonical address used for lifetime recipient counting and custom suppression.
- **Admitted send:** A `/send` request that passes key authentication, input validation, key policy, recipient policy, and visible limits, then commits its recipient and counter state. An admitted send may still be silently suppressed or fail during provider handoff.
- **Custom suppression:** Suppression created through the relay's own “Report unwanted OTP” flow.
- **Provider suppression:** Suppression created by the email provider after a bounce, provider-level spam complaint, or its own policy decision.

## Key lifecycle

| State               | May send | Recipient policy                         | Expiry                             |
| ------------------- | -------- | ---------------------------------------- | ---------------------------------- |
| Provisioned         | No       | None                                     | 7 days after provisioning          |
| Activated, unpinned | Yes      | First admitted recipient becomes the pin | 30 days without an admitted send   |
| Activated, pinned   | Yes      | Exact pin only                           | 30 days without an admitted send   |
| Claimed             | Yes      | Up to 100 recipient identities           | None                               |
| Suspended           | No       | Preserved                                | Operator or future recovery policy |
| Revoked or expired  | No       | Terminal                                 | —                                  |

### Provision

`POST /keys` takes no body and requires no authentication. It returns:

- the provisioned, disabled API key; and
- a separate activation URL.

The API key and activation token are independently generated, high-entropy secrets. Only their hashes are stored. The plaintext API key is returned once and must not appear in logs.

Provisioning is rate-limited at the Cloudflare edge. The limit and its response are not part of `/send`'s delivery-obscuring behavior.

### Activate

Opening the activation URL performs no state change. It renders a page containing Turnstile and one activation button.

The button submits a `POST`. The server validates the Turnstile token, activation token, hostname, and action, then atomically marks the key activated. Activation proves that a human completed the step; it does not prove inbox ownership.

Activation tokens are single-use and expire with the provisioned key. Activation and other secret-bearing pages use HTTPS, contain no third-party resources, and send `Referrer-Policy: no-referrer`.

### Pin

The first `/send` request for an activated key that passes every visible limit atomically commits its recipient as the pin before suppression is evaluated. This remains true when the recipient is already suppressed and the email is silently dropped.

Committing the pin on the request, rather than on an unknowable delivery result, gives concurrent first sends one deterministic winner and prevents suppression from changing key state observably.

Until claim, later sends must use the exact validated address string used by the first send. Case changes, aliases, or other alternate spellings are not accepted even when they canonicalize to the same recipient identity. A key pinned to the wrong address is revoked or allowed to expire; the caller provisions another key.

### Claim

Every OTP email sent while a key is activated but unclaimed includes a newly generated claim link. This is part of the normal OTP email; claiming does not send another email or OTP.

The claim link is a bearer magic link proving access to the pinned inbox:

- it is bound to the key and pin;
- its random token is stored only as a hash;
- it expires after 24 hours;
- opening it with `GET` performs no state change; and
- the page claims the key only after an explicit `POST` backed by a valid Turnstile token.

The claim link, not Turnstile, proves inbox access. Forwarding the email delegates that proof to the recipient of the forward; this is an inherent property of bearer magic links and is accepted.

Claiming is one atomic transaction. It:

1. verifies that the key remains activated, pinned, and unclaimed;
2. verifies that the claim token belongs to that key and pin and has not expired;
3. verifies that the owner inbox is not suspended and has fewer than five active claimed keys;
4. records the canonical pin as the owner inbox;
5. makes the pin the first member of the key's 100-recipient lifetime set; and
6. marks the key claimed and invalidates every outstanding claim token for it.

If the five-key cap is full, the key remains activated and pinned. The claim page explains the limit without changing the key.

### Rotate and revoke

An authenticated rotation replaces the secret on the same key record. It preserves the claim, recipient set, counters, strikes, and owner inbox, and atomically invalidates the old secret. Rotation does not consume another claimed-key slot.

An authenticated revocation permanently disables the key. A revoked claimed key no longer occupies one of the owner's five active-key slots, but its send and abuse history remains associated with the owner inbox.

A suspended key cannot rotate or revoke itself to escape enforcement.

## Address handling

The service keeps two address forms:

- **Delivery address:** the validated address exactly as submitted. This is passed to the email provider.
- **Recipient identity:** a conservative canonical form used for recipient sets, inbox ownership, custom suppression, and abuse counting.

V1 accepts one ASCII mailbox in bare `local-part@domain` form. It rejects display names, comments, groups, lists, whitespace around the address, control characters, and CR/LF. Validation establishes a safe single mailbox; it does not claim that the mailbox exists.

Canonicalization follows these rules:

1. Lowercase the domain. Preserve the local part for every domain not listed below.
2. For `gmail.com` and `googlemail.com` only:
   - lowercase the local part;
   - remove every dot from the local part;
   - remove the first `+` and everything after it; and
   - canonicalize `googlemail.com` to `gmail.com`.

The service does not lowercase or strip `+suffix` from arbitrary local parts. SMTP assigns local-part semantics to the receiving domain, so aggressive global rewriting can merge two real mailboxes and suppress the wrong person.

## Send API

`POST /send` authenticates with the API key and accepts exactly:

```json
{
  "recipient": "person@example.com",
  "otp": "123456"
}
```

The endpoint is not idempotent. Callers must not automatically retry an ambiguous timeout; a retry may send a duplicate OTP and consumes another daily send.

### Send transaction

For each authenticated, well-formed request, the service:

1. loads the key and verifies that it may send;
2. validates the recipient and OTP;
3. atomically pins an unpinned key or enforces its existing pin;
4. for a claimed key, atomically finds or appends the recipient identity, refusing a new identity when the set already contains 100;
5. atomically increments the key's UTC-day counter if it is below 100;
6. checks custom suppression;
7. if not suppressed, atomically reserves capacity under the global daily provider budget;
8. creates a send record without storing the OTP;
9. commits the admission transaction, or rolls it back completely when any visible limit fails;
10. renders the fixed template, including claim and report links as applicable;
11. for a suppressed recipient, records an internal silent-drop outcome and returns `202`;
12. otherwise hands the message to Cloudflare Email Service and records its message id; and
13. returns `202` without delivery details.

Steps 3–9 are one database transaction. Pinning, a new recipient slot, and counters do not survive a visible policy refusal.

All admitted sends consume the per-key daily counter and any new recipient slot, including silently suppressed sends and sends followed by a provider infrastructure failure. Otherwise callers could use quota or set behavior to probe suppression, and ambiguous failures could exceed a limit.

Only sends offered to the provider reserve global cost capacity. A reservation may be released after a definite synchronous provider rejection, but not after an ambiguous failure where the service cannot prove that no billable send occurred.

### Responses

“No delivery oracle” does not mean that every API mistake returns `202`. It means suppression and downstream recipient outcomes are hidden after the request has passed visible policy.

| Status                        | Meaning                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `202`                         | Accepted. The email may have been handed to the provider or silently suppressed.                                                            |
| `400`                         | Invalid JSON, recipient, or OTP shape.                                                                                                      |
| `401`                         | Missing or invalid API key.                                                                                                                 |
| `403 key_unavailable`         | The key is provisioned, expired, revoked, or suspended.                                                                                     |
| `403 pin_mismatch`            | An unclaimed key attempted to send anywhere except its exact pin.                                                                           |
| `403 recipient_limit_reached` | A claimed key attempted to add recipient identity 101. Existing recipients still work.                                                      |
| `429 key_daily_limit`         | The key has admitted 100 sends in the current UTC day. Includes `Retry-After`.                                                              |
| `429 global_daily_limit`      | The service-wide daily cost slice is exhausted. Includes `Retry-After`.                                                                     |
| `503`                         | A non-recipient-specific infrastructure failure occurred. Admission state might already be committed, so the caller must not retry blindly. |

`recipient_limit_reached` explains that the application has graduated from the relay and must replace the delivery adapter with its own sender, such as SES or Resend. It is not a paid-upgrade prompt.

Provider responses and events that identify suppression, bounce, complaint, or recipient rejection are never returned to the key holder.

## Message template

All messages use one versioned OTP-only template and one sending stream:

- fixed From address on `otp.auth.ax`;
- fixed subject;
- the six-digit OTP;
- a short explanation that an application requested the OTP;
- a claim link while the key is unclaimed; and
- a unique “Report unwanted OTP” link.

The message has matching plain-text and HTML parts. It contains no marketing, application branding, tracking pixel, click tracking, attachment, or caller-selected reply address.

## Limits

| Limit                               | Activated                                                 | Claimed                                               |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Lifetime recipient set              | Exact pin                                                 | 100 canonical recipient identities, including the pin |
| Admitted sends per UTC day          | 100                                                       | 100                                                   |
| Active claimed keys per owner inbox | —                                                         | 5                                                     |
| Expiry                              | 7 days unactivated; then 30 days without an admitted send | None                                                  |

The global cost ceiling is a monthly email budget of about $50, enforced as a conservative daily send allowance shared by every key. The deployed allowance is an integer configuration value derived from current provider pricing and the billing period; unused daily capacity does not roll forward.

Exhausting the global allowance is an incident. It is not intended to be normal contention between applications.

Recipient slots are append-only while a key is active. Revoking a key deletes no history. Existing recipients remain sendable when the set is full. New recipients are refused.

Every product limit and enforcement rule is public. No defense depends on an attacker not knowing a threshold. Deployment values live in versioned configuration and become part of this specification once settled.

## Custom abuse reporting

The footer link is a relay-specific report mechanism. It is not a bounce link, a provider unsubscribe header, or the mailbox provider's “Report spam” button. Its purpose is to stop unwanted relay traffic before the recipient resorts to a provider-level spam complaint.

Each email handed to the provider receives a unique, unguessable report token bound to its send, key, and recipient. The token is stored only as a hash.

### Report

Opening the report URL with `GET` displays a confirmation page and changes nothing. This prevents link scanners and preview bots from suppressing addresses. The page:

- masks the recipient address;
- identifies the message as an OTP relay email;
- explains that confirming stops OTP relay mail from every application using this service; and
- provides one explicit “Stop these emails” button.

The button performs a `POST`. Confirmation atomically:

1. adds the recipient identity to the relay's global custom suppression list;
2. records the report against the send;
3. silently suppresses all later `/send` requests to that identity;
4. suspends the key immediately if it is still unclaimed; or
5. gives the claimed key's owner inbox one active custom-report strike.

Repeated confirmation of the same report is idempotent. Multiple reports from the same recipient identity count once toward an owner inbox during the strike window.

Past the configured strike threshold, every active key belonging to that owner inbox is suspended. The exact launch threshold remains an open decision below.

### Undo and later restoration

The confirmation page immediately offers “Undo” for the report just created. Undo is an explicit `POST` authorized by the same report capability. A report can be reversed once; it cannot be toggled repeatedly. Undo removes the suppression only when no other active custom report exists for that recipient identity.

For later recovery, a public restoration page accepts an email address behind Turnstile. It always displays the same result, whether the address is suppressed or unknown.

If the address has only a custom suppression, the service sends one fixed, service-controlled restoration email containing a magic link that expires after one hour. This control email is allowed through custom suppression because the recipient explicitly requested it; application-triggered OTP email remains blocked. Confirming the link:

- removes the custom suppression;
- marks every active custom report from that recipient identity reversed;
- removes the active strikes caused by those reports;
- reactivates keys only when their sole suspension cause was the now-reversed custom-report threshold; and
- retains an immutable audit record of every action.

Restoration requests are protected by Turnstile and an edge rate limit. Restoration emails do not use an application key or consume its counters.

Custom restoration never removes a provider suppression caused by a hard bounce or provider-level spam complaint. If the email provider refuses the restoration message, the page still reveals nothing and the custom suppression remains.

## Provider bounces and complaints

Cloudflare Email Service owns SMTP retries and its account suppression list:

- hard bounces are permanently suppressed by the provider;
- repeated soft bounces may be temporarily or permanently suppressed; and
- provider-level spam complaints are suppressed by the provider.

Email lifecycle events arrive through a Cloudflare Queue. The consumer updates send outcomes, mirrors the relevant suppression reason, and applies key or owner-inbox enforcement. Queue delivery is at least once, so `eventId` is the idempotency key for every event-side state change.

Provider suppressions are operational reputation controls, not recipient self-service state. The custom report restoration flow cannot reverse them. Provider removal is allowed only through Cloudflare's supported process and only when there is evidence that the recipient wants mail again.

The service monitors global, per-key, and per-owner-inbox rates. Operational targets are:

- hard bounce rate below 2%; and
- provider complaint rate below 0.1%.

Crossing either target triggers an alert and automated containment according to the configured kill-switch policy. The kill switch must run from events without waiting for manual review.

## Data and secrets

One relational database stores:

- keys, secret hashes, states, pin, owner inbox, and lifecycle timestamps;
- append-only key recipient identities;
- UTC-day key counters and the global cost counter;
- send id, key id, delivery and canonical recipient, timestamps, provider message id, and internal outcome;
- hashed activation, claim, report, and restoration tokens;
- custom and mirrored provider suppressions;
- reports, reversals, strikes, and suspension history; and
- processed provider event ids.

OTP values and rendered message bodies are never persisted. Structured logs must redact API keys, URL tokens, OTPs, and full recipient addresses.

Send-level personal data and unused link tokens are retained only for the configured send-history window, then deleted or irreversibly aggregated. Report links expire with that history. The exact window is an open decision below. Key ownership, active suppression, and abuse enforcement records remain as long as they are needed to enforce the corresponding state.

## Reputation and operations

- OTP mail is sent only from `otp.auth.ax`; the apex never sends.
- Future mail categories use different subdomains. OTP and non-OTP traffic never share a reputation stream.
- Cloudflare configures the required SPF, DKIM, and DMARC records. DMARC begins in monitoring mode and moves to enforcement after legitimate alignment is verified.
- Postmaster monitoring targets a provider complaint rate below 0.1% and never permits it to approach 0.3%.
- If `otp.auth.ax` is irrecoverably burned, the service may rotate to another service-owned subdomain. Applications do not configure the From address, so this requires no application migration, but the new domain must warm its reputation from zero.
- A recognizable API-key prefix is registered with GitHub secret scanning. Confirmed leaks trigger revocation.

## Infrastructure

- One TanStack Start application on Cloudflare Workers serves the API, activation, claim, report, and restoration pages. Marketing pages are prerendered and edge-cached.
- Neon Postgres is accessed through Hyperdrive in production. Smart Placement keeps the Worker database-adjacent. Preview deployments connect directly.
- Counters and bounded-set insertions use single-statement conditional writes or transactions with equivalent atomic guarantees.
- Durable Objects are reserved for demonstrated database contention. The global daily counter is the first candidate.
- Cloudflare Email Service is a public-beta dependency accessed through a Worker binding. Its provider message id joins synchronous sends to lifecycle events. Provider sending, suppression, and lifecycle events must be exercised under failure in development before the kill switch is trusted.
- Event subscriptions deliver to a Cloudflare Queue with a dead-letter queue and idempotent consumption.
- The fallback provider is SES. Provider integration is isolated behind fixed-template rendering and one send operation.
- Cloudflare DDoS protection and managed WAF rules are enabled.
- `POST /keys` has an edge rate-limit rule.
- Bot Fight Mode is disabled because legitimate `/send` callers are automated servers and the applicable plan cannot scope it away from API routes.
- The application performs no IP-based `/send` policy. It sees the application server's IP, not the end user's. Turnstile supplies bot friction on human web flows.

## Deliberate exclusions

- **Arbitrary templates or branding:** they reopen the spam and phishing channel.
- **Per-recipient OTP caps, burst windows, and cooldowns:** shared victim budgets let one attacker prevent another application's legitimate sign-in. Custom reports and provider feedback own recipient aftermath instead.
- **Recycling recipient slots:** it permits a key to rotate through unlimited victims.
- **Accounts and organizations:** the verified inbox already supplies the accountability needed for launch. Accounts return only when a management surface earns its cost.
- **Credit-card verification:** it is reserved as an escalation if disposable-inbox key farming becomes material.
- **Caller-IP enforcement:** the relay cannot independently trust a caller-supplied end-user IP.
- **Disposable-domain blocking:** unresolved; see the open decisions.
- **Provider-level unsubscribe headers:** OTP messages are transactional, not subscription or marketing mail. The custom report link serves a different, service-wide safety purpose.

## Library integration

The relay ships as an OTP delivery adapter.

- `202` is delivery success from the adapter's perspective, including silent suppression.
- `429` maps to `rate_limited`.
- `5xx` is an infrastructure failure and throws.
- `recipient_limit_reached` needs a distinct, actionable library outcome; mapping a permanent lifetime limit to `rate_limited` would be misleading.

The last point requires a library contract decision before the adapter is implemented.

## Open decisions

### Custom-report and provider-event kill thresholds

The mechanism is settled, but the launch values are not. A rate-only threshold behaves badly for tiny samples, while a count-only threshold scales badly for large senders. The policy should combine:

- a minimum number of distinct affected recipient identities;
- a rolling send sample;
- hard-bounce and provider-complaint rates; and
- stricter treatment of provider complaints than custom reports.

Cloudflare recommends hard bounces below 2% and complaints below 0.1%. Those are clear global alarm boundaries, but they do not by themselves determine a fair low-volume per-key suspension rule. Launch values need simulation against the maximum key and owner-inbox volumes before implementation.

### Recovery when the current key is lost

Rotation is safe and simple while the caller still has the key. V1 has no account or authenticated dashboard, so losing the only copy leaves operator-assisted recovery as the only path. Before launch, decide whether that is acceptable or whether the verified owner inbox should receive a fixed key-management magic link behind Turnstile.

### Disposable inboxes

Disposable inboxes can multiply the five-key allowance, while blanket blocking rejects legitimate development and privacy use cases. Launch without a blocklist, measure abuse, and add a policy only if evidence shows that disposable-inbox farming is materially consuming the global budget or damaging reputation.

### Library error shape

The hosted adapter needs an actionable permanent outcome when a key reaches its lifetime recipient limit. The current library direction mentions only `rate_limited`. Settle the delivery and `otp.request` result types before implementing the adapter rather than collapsing two different recovery paths into one error.

### Send-history retention

Report links, provider-event correlation, abuse investigation, and data minimization pull the send-history window in different directions. Research establishes the need to retain only what has a defined purpose, but it does not determine a universal duration. Choose and document the launch window after operational and privacy review; report links expire with it.

## Later

- Verification-outcome feedback from the library. It would allow recipient slots to commit only after successful OTP verification instead of on send.
- Optional end-user IP forwarding for honest applications. It can improve their own abuse policy but can never protect the relay, because the value is self-reported.
- A higher daily key limit if legitimate applications repeatedly reach 100 sends per day.
- An inbox-authenticated management surface, potentially using passkeys and dogfooding the auth library.
- SMS delivery.

## Research basis

The following sources informed decisions that were ambiguous or contradictory in the original notes:

- [OWASP forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — bearer URL tokens should be random, securely stored, bound, expiring, and single-use; secret-bearing pages should prevent referrer leakage.
- [Cloudflare Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) — validation is server-side; tokens are single-use and expire after five minutes.
- [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321) — domains are case-insensitive, while local-part semantics belong to the receiving domain and may be case-sensitive.
- [Gmail dot handling](https://support.google.com/mail/answer/7436150) and [Gmail `+suffix` aliases](https://support.google.com/mail/answer/22370) — Gmail-specific canonicalization is documented for consumer Gmail and must not be generalized to arbitrary domains.
- [Mailchimp's accidental-unsubscribe behavior](https://mailchimp.com/help/about-unsubscribes/) and [resubscription flow](https://mailchimp.com/help/resubscribe-a-contact/) — body links use an explicit confirmation to defeat scanners, and later restoration requires a recipient-initiated confirmation.
- [Cloudflare Email Service suppression](https://developers.cloudflare.com/email-service/concepts/suppressions/) and [event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/) — hard bounces, repeated soft bounces, complaints, and asynchronous lifecycle events require provider-side suppression and idempotent event processing.
- [Cloudflare Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) — delivery is at least once, so consumers must deduplicate state changes.
- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) — provider-accepted sends can incur cost; API-boundary suppression rejections do not.
- [Cloudflare deliverability guidance](https://developers.cloudflare.com/email-service/concepts/deliverability/) and [Google sender guidance](https://support.google.com/mail/answer/14229414) — hard-bounce and complaint targets, authentication, stream separation, and domain-reputation monitoring.
