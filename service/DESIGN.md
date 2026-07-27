# OTP email relay — design notes

Decisions from threat modeling, 2026-07-26/27. Complements the sending-service section of `/THREAT-MODEL.md`. Service and folder name provisional.

## Invariant

The caller never controls email content: fixed template, OTP shape-locked (digits, fixed length), recipient a single bare address, 202 always (no delivery oracle). Everything else is arithmetic on caps.

## Flow

1. **Provision** — `POST /keys { email }` → disabled key + activation URL. No auth, no email sent. Unactivated keys expire in 7d.
2. **Activate** — human opens the activation URL: Turnstile + one button → key live in sandbox. No inbox round-trip; inbox control is proven at claim instead. Turnstile prices key farming (the spray loop: one key per victim, one send each — invisible to per-key and per-recipient limits). Solver farms run ~$1–2/1k, so the caps stay.
3. **Sandbox** — sends only to the pinned address (the provisioning email). Separate disposable subdomain. Claim link in every footer.
4. **Claim** — the link only ever lands in the pinned inbox; receiving it is the verification. Turnstile, passkey account (dogfood the library), confirm → pin lifted, production subdomain and quotas, no expiry. Key survives unchanged (2026-07-26, reversal: rotation broke the running app at the moment of conversion; leak risk is bounded by the dead content channel + caps + kill switch; rotation is self-serve). Further keys mint from the account, born production — the account is the accountability unit.

## Quotas

Placeholders — tune against Resend pricing before launch.

| Limit                                        | Sandbox                      | Production |
| -------------------------------------------- | ---------------------------- | ---------- |
| Recipients                                   | 1 (the pinned address)       | any        |
| Sends per key per day                        | 50                           | 100        |
| Sends per recipient per day, across all keys | 50                           | 20         |
| Per-recipient cooldown, across all keys      | none                         | 30s        |
| Key expiry                                   | 7d unactivated, 30d inactive | none       |

- Sandbox cross-key per-recipient cap = per-key quota — farming keys pinned to one victim gains nothing.
- No lifetime caps; daily cap + expiry is the ceiling.
- Global daily sandbox budget as backstop — not load-bearing (Turnstile is), bounds a paid solver run.

## Rejected: one key per email

(2026-07-26) The address is unverified at activation, so uniqueness = squatting — first Turnstile solve blocks the owner. Breaks multi-project (same dev email, one key per repo). No abuse reduction — the cross-key cap already dedupes; quota is per inbox, keys are handles. Uniqueness belongs at the account layer, where inbox control is proven.

## Abuse reporting

Unique send id per email; report link in the footer. The report is a POST button (optionally behind Turnstile), never GET — preview bots fetch links (same reason SPEC.md excludes magic links). Confirmed report → recipient on the global suppression list + key abuse score; threshold auto-suspends. Stored per send: id, key, recipient, timestamp. OTP values never stored, never logged.

## Reputation

- Sandbox and production subdomains split; sandbox disposable, rotated.
- Resend bounce/complaint webhooks → auto-suppression + per-key bounce-rate kill switch — fast and automatic, an ops commitment, not a config line. Bounce rate is what gets transactional senders blocked; abuse traffic targets dead addresses.
- 202-always; bounces feed internal reputation only.
- Disposable-domain recipient policy — undecided: traps hurt the domain, disposables can be legit sign-ups.

## Cloudflare

- DDoS — automatic.
- Edge rate limit on `POST /keys` — dashboard rule, not app code.
- Turnstile on activation and claim pages.
- WAF managed rules on.
- Bot Fight Mode off — legit API clients are bots; free tier can't path-scope.
- No IP logic in app code — `/send` is server traffic (one IP = whole app); Turnstile does IP reputation.

## Stack

- One TanStack Start app on Workers: API (server routes over plain functions), activation/claim/abuse pages, dashboard, marketing (prerendered → edge cache). No API framework — Hono was considered for later API extraction, but the API and dashboard are permanently DB-adjacent; marketing is the only piece that ever splits (to Astro, if it needs its own cadence). (2026-07-27)
- Neon Postgres + Hyperdrive + Smart Placement (2026-07-27). Counters are single-statement conditional writes (increment-if-under-cap, `RETURNING`). One relational DB: keys, counters, send log, suppression, accounts. Durable Objects in reserve for hot counters — the global budget is the single-row candidate. Previews connect direct; Hyperdrive production-only (static configs).
- ESP: Resend.
- Key format: recognizable prefix, registered with GitHub secret scanning. A leaked key is low-value by design — quotas bound the damage, rotation is cheap, and the content channel is dead regardless.
- Library integration: service 429 surfaces as `rate_limited` via widened `send` — THREAT-MODEL.md.

## Later

- Quota tiers: behavior-based auto-raise, card verification (no charge, identity signal), enterprise.
- End-user IP forwarding — THREAT-MODEL.md.
- Verification-outcome feedback — send-only trade-off accepted 2026-07-17, THREAT-MODEL.md.
- SMS transport.
