# Sending service design

> This document is public. Controls enforced by invariants (limits, quotas, template rules) are published, since their effectiveness does not depend on secrecy. Controls enforced by heuristics (detection signals, response thresholds) are weakened by disclosure and are not documented here.

## Anonymous keys

Let an agent autonomously create a real, shareable demo without human setup.

### Getting a key

1. The agent calls `POST /new-key`.
2. The service returns a live anonymous key immediately, without signup or human interaction.
3. The agent stores the key outside source control and configures the application to use it.

### Restrictions

| Restriction                 | Limit                                                                                            | Scope                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| Key creation                | 2 new anonymous keys per 24 hours                                                                | Per key-creation IP address |
| Active keys                 | 10 active anonymous keys                                                                         | Per key-creation IP address |
| Email addresses             | 5 distinct email addresses¹                                                                      | Per key, lifetime           |
| Email messages              | 10 OTP email messages                                                                            | Per key, per day            |
| Expiry                      | 7 days after creation                                                                            | Per key                     |
| Email message type          | OTP only                                                                                         | Per email message           |
| Email message customization | Fixed sender email address, subject, and template; no caller-controlled copy, links, or branding | Per email message           |

¹ Email addresses are lowercased before comparison. Suffixes and periods are preserved: `user+one@gmail.com`, `user@gmail.com`, and `u.ser@gmail.com` are distinct email addresses.

## Claimed keys

Let a developer continue from a working demo to a useful application without configuring an email provider, after becoming accountable to Auth.ax.

### Getting a key

1. The developer starts a claim for an existing anonymous key.
2. The developer authenticates through GitHub OAuth.
3. Auth.ax verifies that the GitHub account is at least 6 months old.
4. The service preserves the relay project, email address history, and reputation.
5. The service invalidates the anonymous key and issues a claimed key.
6. The claimed key is stored outside source control and configured in the application.

### Restrictions

| Restriction                 | Limit                                                                                            | Scope                         |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| GitHub account age          | At least 6 months                                                                                | Per GitHub identity           |
| Email addresses             | 250 distinct email addresses¹                                                                    | Per GitHub identity, lifetime |
| Email messages              | 1,000 OTP email messages                                                                         | Per GitHub identity, per day  |
| Expiry                      | None                                                                                             | Per key                       |
| Email message type          | OTP only                                                                                         | Per email message             |
| Email message customization | Fixed sender email address, subject, and template; no caller-controlled copy, links, or branding | Per email message             |

## Non-risks

Risks that do not apply to this service, or apply materially less than elsewhere. Logged so mitigation effort is not spent where it isn't needed.

| Non-risk                                   | Why it does not apply, or applies less                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spam and phishing payloads                 | The fixed template closes the content channel. The only caller-controlled value is the OTP itself, so a leaked or malicious key cannot carry copy, links, or branding.                                                                                         |
| Spam-folder placement (sending reputation) | OTP email is expected and actively awaited; recipients check the spam folder when it does not arrive. Junk placement degrades UX without breaking the flow. Outright provider blocking still breaks delivery, so reputation is a reduced risk, not a non-risk. |
| Economically motivated abuse               | With no content channel there is nothing to sell or phish, so the service is useless to spam operations. The remaining attacker motive is vandalism.                                                                                                           |
| Anonymous key leakage                      | A stolen anonymous key grants nothing the thief could not get by minting their own key for free. The residual — burning the victim demo's own quota — is bounded by the per-key limits.                                                                        |

## Anonymous key abuse posture

### Solved

- Content attacks — eliminated by the fixed template
- Cost — bounded by the tier-wide daily pool (fail closed)
- Inbox flooding — bounded by the per-inbox tier-wide cap
- Scalable abuse — deterred by the small pool (no payoff)
- Pool-exhaustion vandalism — accepted, softened by shed-newest-first
- Upgrade pressure — narrow per-key limits funnel good-faith users to claim

### Still open

1. **Reputation vandalism** — spamtraps/invalid addresses inside quota. Needs the reactive pieces: MX/syntax check at send, bounce feedback with auto-suspension, and a separate (rotatable) sending subdomain for the anon tier. These are decided in spirit but not designed.
2. **The error contract** — the send-refusal responses that carry the claim funnel. Needs defining.
3. **Address normalization** — one canonical form for the per-inbox cap (and possibly seat counting), replacing the current footnote's preserve-everything rule.
4. **Numbers** — pool size, per-inbox cap, shed window.
5. **Doc** — most of this model isn't written into this document yet; it still only has the per-key/per-IP tables.
