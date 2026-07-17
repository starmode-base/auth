# Threat model

Who owns each defense on the otp surface: library, adapters, app/infra, or the (optional, future) sending service.

**The placement principle (decided 2026-07-17):** a rate limit is a decision over state. It is enforced where that state lives, atomically — or it isn't real. "Rate limiting" is not one thing; each vector below has its own state, and therefore its own owner.

## The surface

`requestOtp({ identifier })` is unauthenticated by design — anyone can type an email and trigger a send. Cost, inbox noise, and sender reputation all ride on that one call. `verifyOtp` adds the guessing surface.

## Vector map

| #   | Vector                   | Attack                                   | State that decides it                  | Owner                              | Defense                                                                                                                          |
| --- | ------------------------ | ---------------------------------------- | -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resend flooding          | Hammer `requestOtp` for one identifier   | The live otp record                    | **Library** (mechanism)            | Per-identifier cooldown in `makeOtpStorage` — atomic conditional put; `requestOtp` fails `rate_limited`, nothing sent            |
| 2   | Inbox bombing            | Sustained sends to one victim over hours | Per-identifier counters                | **App/infra**; service when used   | Hourly/daily caps. The library ships none — counter state is out of scope                                                        |
| 3   | Mass sending, cost abuse | Scripted sends to many identifiers       | Request metadata (IP), global counters | **App/infra**                      | Gate before `requestOtp` — the server function holds the IP (TanStack `getRequestIP`, Next.js `headers()`); captcha/WAF for bots |
| 4   | Reputation burn          | Sends to spam traps and dead addresses   | Cross-app sending outcomes (bounces)   | **Sending service**; else your ESP | Service: per-recipient and per-key caps, bounce handling. Self-hosted: your domain, your risk                                    |
| 5   | Otp brute force          | Guess the otp at `verifyOtp`             | The otp record                         | **Library** (decided 2026-07-16)   | One attempt per otp — a wrong guess consumes it; short TTL; single use                                                           |
| 6   | Otp phishing             | Trick the user into relaying the otp     | None — human factor                    | **App** (flow choice)              | Passkeys for everyday sign-in; strict mode closes the otp backdoor for existing users                                            |

Rows 1 and 5 are the library's complete obligation — everything its own state can enforce atomically. Rows 2–4 need state the library never sees (counters, requests, cross-app outcomes); pulling them in would mean importing new state classes, which is how nano scope dies.

## Deployment shapes

The sending service is optional and does not exist yet. The map must be sound without it:

| Defense       | Dev (console) | Self-hosted (own Resend/SendGrid) | With sending service                                                                    |
| ------------- | ------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| 1 Cooldown    | ✓ library     | ✓ library                         | ✓ library (+ service, per recipient)                                                    |
| 2 Caps        | —             | app/infra                         | ✓ service, per recipient                                                                |
| 3 IP/bots     | —             | app/infra                         | app/infra — unchanged; the service only ever sees your server's IP, never your callers' |
| 4 Reputation  | n/a           | your domain, your ESP account     | ✓ service (shared domain)                                                               |
| 5 Brute force | ✓ library     | ✓ library                         | ✓ library                                                                               |

Self-hosted posture = library (1, 5) + app/infra (2, 3) + owning your ESP risk (4). The service moves 2 and 4 service-side; 3 always stays with the app.

## Sending service (future — mapped ahead of build)

A free hosted endpoint that sends a fixed-template otp email via Resend. Takes only `(email, otp)` — no subject, no body, no sender. Exists so users skip DNS/SPF/ESP setup; anyone can bypass it with their own delivery adapter.

**Why the fixed template matters:** the only attacker-controlled inputs are the recipient and the otp. There is no spam-content vector — almost. The otp itself is a free-text field until validated, so the service must enforce otp shape (digits, fixed length) or that one field becomes a spam channel.

Service-side defenses (its own abuse surface, not the library's):

- Per-recipient cooldown and daily cap **across all API keys** — victim protection no single app can provide
- Per-key caps — cost and abuse isolation
- Otp shape validation — kills content injection through the one free-text field
- Bounce/complaint handling, disposable-domain policy — protects the shared sending domain
- Library integration: service refusals (429) surface through delivery as `rate_limited` — requires widening `send` from `Promise<void>`, deferred until this adapter exists

Known trade-off (2026-07-17): send-only means the service never sees verification outcomes, so reputation scoring is limited to volume and bounces. Accepted for launch.

Open questions:

- Key issuance — anonymous free keys vs sign-up
- Actual limit numbers (cooldown, per-recipient cap, per-key cap)
- Whether verification-outcome feedback ever gets added
- Forwarding the end-user IP (`requestOtp({ identifier, ip })` → delivery → service) so the service can rate limit per caller on the app's behalf. Self-reported, so it protects honest apps — never the service itself (per-key caps do that). Lands with the service adapter and the `send` widening, as `ip: string | null`
- SMS transport later
