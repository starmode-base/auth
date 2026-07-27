# OTP email relay — design notes

Pre-implementation notes from the threat-modeling session of 2026-07-26. Complements the sending-service section of `/THREAT-MODEL.md`. Service and folder name provisional ("email relay" per SPEC.md).

## What it is

A free hosted send-only endpoint: takes an email address and an OTP, sends a fixed-template email via Resend, runs on Cloudflare Workers. Exists so an agent can set up OTP email delivery with no DNS, no ESP account, and no dashboards. Anyone can bypass it with their own delivery adapter.

## The one invariant

At no tier does the caller control a byte of email content: the template is fixed, the OTP is shape-locked (digits, fixed length range), the recipient is a single bare address (strict parse, no display names), and the API always returns 202 (no delivery oracle). Every residual risk below is annoyance-level because the payload channel does not exist.

## Flow

### 1. Provision — agent, no auth

`POST /keys { email }` → `{ key, activationUrl, expiresAt }`. The key is disabled; nothing is emailed. Unactivated keys expire after 7 days. Abuse surface is free row-writes: edge rate limit plus the expiry sweep.

### 2. Activate — human, ~10 seconds

The agent hands the user the activation URL. The page runs Turnstile and shows one activate button; the key goes live in sandbox. No inbox round-trip and no email verification here — inbox control is proven at claim, because the claim link only ever lands in the pinned inbox. Turnstile makes activation cost a human interaction, which kills scripted key farming (the spray loop: one key per victim, one send each — blind spot of both per-key and per-recipient limits). Turnstile is a cost, not a wall (solver farms run ~$1–2 per thousand), so the caps behind it stay.

### 3. Sandbox — activated, unclaimed

The key sends only to its pinned address: the email given at provisioning, ideally the developer themselves. Sandbox mail goes out on a separate, disposable subdomain. Every sandbox email carries the claim link in the footer.

### 4. Claim — human, production gate

From the claim link (receiving it is the verification — only the pinned inbox ever sees it): Turnstile, create an account (passkey — dogfood the library), review the key's usage, confirm. On claim the pin is lifted, sending moves to the production subdomain, production quotas apply, expiry is removed. The key itself survives unchanged (decided 2026-07-26, reversing an earlier draft): rotating at claim breaks the running app at the exact moment of conversion, and the leak risk rotation addressed is bounded — dead content channel, caps, kill switch — so rotation is self-serve from the account instead. Once claimed, further keys mint directly from the account, born production with no activation flow; the account is the accountability unit, and suspension hits all its keys.

## Quotas

Placeholders — tune against Resend pricing and observed traffic before launch.

| Limit                                        | Sandbox                      | Production |
| -------------------------------------------- | ---------------------------- | ---------- |
| Recipients                                   | 1 (the pinned address)       | any        |
| Sends per key per day                        | 50                           | 100        |
| Sends per recipient per day, across all keys | 50                           | 20         |
| Per-recipient cooldown, across all keys      | none                         | 30s        |
| Key expiry                                   | 7d unactivated, 30d inactive | none       |

Notes:

- The sandbox cross-key per-recipient cap equals the per-key quota, so farming extra keys pinned to one victim gains nothing over a single key.
- No lifetime send cap: the daily cap plus inactivity expiry is the ceiling.
- A global daily budget across all sandbox sends stays as a backstop. It is no longer load-bearing (Turnstile is), but it turns "someone paid a solver farm" into a bounded bad day confined to the sandbox subdomain.
- Production quota growth is a later tier, not a launch knob (see Later).

## Rejected: one key per email

Considered and rejected (2026-07-26): refusing new keys for an address that already has an activated key. The address is unverified at activation by design, so uniqueness would grant exclusive rights to whoever activates first — one Turnstile solve pinned to a victim's address would block the owner from ever provisioning (address squatting). It also breaks the multi-project case (same dev email, one key per repo) and buys no abuse reduction: the cross-key per-recipient cap already makes duplicate keys worthless — the quota is per inbox, keys are just handles on it. Uniqueness belongs at the account layer, at claim, where inbox control is proven; multiple production keys per account is the normal per-project pattern.

## Abuse reporting

Every email carries a unique send id and a report-abuse link in the footer. The report page must not act on GET — link-preview bots fetch links (the same reason SPEC.md excludes magic links); rendering is safe, the report itself is a button (POST), optionally behind Turnstile. A confirmed report adds the recipient to the global suppression list (no future mail from any key) and increments the key's abuse score; past a threshold the key auto-suspends. Stored per send: send id, key id, recipient (needed for suppression), timestamp. OTP values are never stored and never logged — send and forget.

## Reputation containment

- Sandbox and production send from separate subdomains; the sandbox subdomain is disposable and rotated on a schedule.
- Resend bounce/complaint webhooks feed auto-suppression and a per-key bounce-rate kill switch. The switch must be fast and automatic — this is an ops commitment, not a checkbox.
- 202-always keeps the API from becoming a list-washing oracle; bounces inform internal reputation only.

## Cloudflare checklist

- DDoS protection — automatic, nothing to configure.
- Edge rate-limit rule on `POST /keys` — one dashboard rule, not app code.
- Turnstile on the activation and claim pages.
- WAF managed rules on — generic hygiene.
- Bot Fight Mode off — the API's legitimate clients are bots (agents); the free tier cannot path-scope it away from the API routes.
- No IP logic in app code: `/send` traffic is app servers (one IP carries a whole app), and Turnstile already does IP reputation where it matters.

## Implementation notes

- Cloudflare Workers, with Durable Objects for the atomic counters (cross-key per-recipient caps, quotas, the sandbox budget) — strong consistency where the cap state lives.
- ESP: Resend.
- Key format: recognizable prefix, registered with GitHub secret scanning; low sandbox quotas bound leak damage; cheap rotation.
- Library integration: service 429s surface through the delivery adapter as `rate_limited` — requires widening `send` from `Promise<void>`; tracked in THREAT-MODEL.md's open questions.

## Later

- Quota tiers above the production default: sustained good sending behavior (low bounce/complaint rate over N days) auto-raises limits; credit-card verification (no charge, identity signal); enterprise arrangements.
- End-user IP forwarding (`requestOtp({ identifier, ip })` passthrough) — open question in THREAT-MODEL.md.
- SMS transport.
