# Sending service design

## Key purposes

| Key       | Purpose                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous | Let an agent autonomously create a real, shareable demo without human setup.                                                                       |
| Claimed   | Let a developer continue from a working demo to a useful application without configuring an email provider, after becoming accountable to Auth.ax. |

## Anonymous key restrictions

| Restriction                 | Limit                                                                                            | Scope                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| Key creation                | 2 new anonymous keys per 24 hours                                                                | Per key-creation IP address |
| Active keys                 | 10 active anonymous keys                                                                         | Per key-creation IP address |
| Email addresses             | 5 distinct email addresses¹                                                                      | Per key, lifetime           |
| Email messages              | 10 OTP email messages                                                                            | Per key, per day            |
| Expiry                      | 7 days after creation                                                                            | Per key                     |
| Email message type          | OTP only                                                                                         | Per email message           |
| Email message customization | Fixed sender email address, subject, and template; no caller-controlled copy, links, or branding | Per email message           |

¹ Email addresses are lowercased before comparison. Suffixes and periods are preserved: `user+one@gmail.com`, `user+two@gmail.com`, and `u.ser@gmail.com` are distinct email addresses.
