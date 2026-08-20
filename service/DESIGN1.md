# OTP email relay — design notes

This document specifies the hosted sending service. It complements the sending-service section of `/THREAT-MODEL.md`.

## Invariant

The caller never controls email content. The template is fixed, the OTP must match a strict shape (digits, fixed length), and the recipient is a single bare address. The API always returns 202, so delivery status leaks nothing. Because the service carries no payload, spam and phishing have nothing to carry; the abuse that remains is addressed by the limits and reporting below.

## Flow

1. **Provision.** `POST /keys` takes no input and requires no authentication. It returns a disabled key and an activation URL. Nothing is emailed.
2. **Activate.** A human opens the activation URL, passes Turnstile, and clicks one button. The key is now live, and the first address it emails becomes its pin — the only address it may send to. A key pinned to the wrong address is simply discarded; keys are disposable.
3. **Claim.** Every email carries a claim link in its footer until the key is claimed. The link opens the claim page, where the service sends an OTP to the pin. The human enters the OTP behind Turnstile, and the key is claimed. The OTP is the sole proof of inbox control — the link itself carries no power, so a forwarded email cannot claim a key. Claim OTPs ride the same pipeline and counters as every other send.

## Limits

All limits are public (see Public by design). Each guard has exactly one job: the recipient set bounds reach, the per-key rate bounds volume, and the global ceiling bounds cost.

| Limit                                 | Activated                            | Claimed |
| ------------------------------------- | ------------------------------------ | ------- |
| Recipient set (lifetime, append-only) | the pin                              | 100     |
| Sends per key per day                 | 100                                  | 100     |
| Claimed keys per verified inbox       | —                                    | 5       |
| Key expiry                            | 7 days unactivated, 30 days inactive | none    |

The global ceiling is a monthly dollar budget (about $50), enforced as a daily slice across all keys. Tripping it is an incident to investigate, not normal contention.

Emails are sent to the address exactly as given. Counting and suppression use a normalized form: lowercased, one `+suffix` stripped, and dots stripped for `gmail.com`/`googlemail.com` — otherwise the set and the suppression list have a tag-shaped hole. The pin is compared exactly.

When a set is full, sends to recipients already in the set keep working, so current users can still sign in. New recipients are refused with a message that names the fix: swap the delivery adapter for your own sender (Resend, SES, and so on). Graduation is the product working, not a paywall. A set filled by bots hitting the app's own signup form recovers the way every mistake does: discard the key, re-key, re-claim. Slots are never recycled, because recycling would allow victim rotation.

The per-inbox key cap exists because one inbox could otherwise claim unlimited keys and multiply its reach. Its value is anti-multiplication, not identity strength: disposable inboxes remain an accepted residual, bounded by the ceiling and the reactive layer.

## Rejected

- **One key per email.** The address is unverified at activation, so uniqueness would grant the address to whoever activates first, and it would break developers with several projects. Uniqueness belongs where inbox control is proven: the per-inbox cap on claimed keys.
- **Pin parameter at creation.** Pinning at first use has the same security — the same party chooses the address either way — and needs no parameter.
- **User and org accounts.** Accounts are bookkeeping, not security: a disposable inbox claims an account as easily as a key. The key is the project, and the verified inbox is the identity — it is the ban unit, and the per-inbox key cap hangs off it. Accounts return only if a management surface earns its place (see Later).
- **Per-recipient caps, burst windows, cooldowns, and queue throttles.** Each one bounded the same harm, only slower, while the report link already owns the aftermath: one click ends an inbox's exposure forever. Shared per-recipient budgets also let an attacker exhaust a victim's quota and block their legitimate sign-ins. A guard must earn its place; these did not.
- **Credit card at claim.** Comparable free tiers run card-less (Clerk development instances, Firebase Spark). The card is the escalation lever if burner-inbox farming ever materializes, not a launch gate.
- **Separate sending domain.** A subdomain is standard practice for solicited transactional mail, and blocklists list the narrowest match when the parent domain is legitimate. A fresh unrelated domain warms up from zero and reads as phishing.
- **API framework (Hono).** The API and the web surfaces are permanently database-adjacent, so there is no future API extraction to prepare for. Marketing is the only piece that could ever split out (to Astro, if it needs its own cadence).

## Abuse reporting

Every email carries a unique send id and a report link. The report page acts only on POST, because preview bots fetch links (the same reason SPEC.md excludes magic links). A confirmed report adds the normalized recipient to the global suppression list — no key ever emails that address again — and gives the sending key's verified inbox a strike; past a threshold, every key on that inbox is suspended. Senders learn nothing: the API still returns 202 and the send silently drops, since anything else turns suppression into an oracle. Suppression is self-serve reversible by proving inbox ownership with an OTP. The service stores the send id, key, recipient, and timestamp for each send. OTP values are never stored and never logged.

## Reputation

- All mail is sent from `otp.auth.ax`; the apex never sends. Both tiers share the subdomain. If it is ever burned, the service rotates to a fresh subdomain — invisible to apps, since the service owns the From address, but reputation rewarms from zero. Future mail streams get their own subdomains; this one stays OTP-only.
- Bounce and complaint events (`message.bounced`, `message.complained`, via a Queues subscription) drive auto-suppression and a per-inbox kill switch. The switch must be fast and automatic — an ops commitment, not a config line. Bounce rate is what gets transactional senders blocked, and abuse traffic targets dead addresses.
- The report link doubles as reputation shielding: it is a faster action than the spam button, so the signal reaches us instead of Gmail's complaint ratio.
- Disposable-domain recipient policy is undecided: trap addresses hurt the domain, but disposable addresses can be legitimate sign-ups.

## Public by design

The repository is open source and the design assumes it: no guard depends on secrecy, because knowing every rule does not help anyone around them. Product limits are documented here; operational thresholds live in wrangler config, visible on GitHub. The database or secrets may hide a value only when hiding is load-bearing, never as theatre.

## Cloudflare

- DDoS protection is automatic.
- `POST /keys` is rate-limited at the edge — a dashboard rule, not app code.
- WAF managed rules are on.
- Bot Fight Mode is off: legitimate API clients are bots, and the free tier cannot scope it away from the API routes.
- No IP logic in app code: `/send` traffic comes from app servers, where one IP carries a whole app, and Turnstile already does IP reputation where it matters.

## Stack

- One TanStack Start app on Workers serves the API (server routes over plain functions, no API framework), the activation, claim, and report pages, and the marketing pages (prerendered, so they serve from edge cache).
- Neon Postgres behind Hyperdrive, with Smart Placement pinning the worker near the database. Counters are single-statement conditional writes (increment-if-under-cap with `RETURNING`). One relational database holds keys, counters, the send log, and suppression. Durable Objects are held in reserve for hot counters — the global ceiling is the single-row candidate. Previews connect to Neon directly; Hyperdrive is production-only, since its configs are static.
- The ESP is Cloudflare Email Service, public beta accepted at this service's stakes. It binds directly to the Worker (no API key), configures SPF, DKIM, and DMARC on the zone automatically, ships built-in suppression with complaint feedback loops, and delivers lifecycle events to a Queue — `bounced` and `complained` feed the kill switch. The events feature is new; exercise it hard in development before trusting the kill switch to it. Pricing is $0.35 per 1,000 sends after the 3,000 per month included with Workers Paid. The fallback is SES ($0.10 per 1,000, mature); the migration surface is one fixed template and one send call.
- Keys have a recognizable prefix, registered with GitHub secret scanning. A leaked key is low-value by design: sets and rates bound the damage, re-keying is cheap, and the content channel is dead regardless.
- Library integration: service refusals surface through the delivery adapter as `rate_limited` (see THREAT-MODEL.md).

## Later

- Verification-outcome feedback (the send-only trade-off is recorded in THREAT-MODEL.md). It would also let set slots confirm only on verified OTPs, so bot signups stop consuming sets and re-keying stops being the recovery.
- A per-key daily rate raise (for example 1,000 per day) if real hundred-user apps hit 100 per day. One config value.
- End-user IP forwarding (THREAT-MODEL.md).
- Accounts and a dashboard (passkey, dogfooding the library) — only if a management surface earns its place.
- SMS transport.
