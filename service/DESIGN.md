# Hosted service design

> This document is public. Agents must not add secrets, private detection signals, or other sensitive operational information without first discussing it with the user.

## Executive summary

The Auth.ax hosted service is an optional operational layer for applications built with the library. The application database remains the source of truth. Version one provides Auth.ax accounts, OTP email delivery, and sending key management. The email relay is the first capability, not the purpose of the service. The same account and application model can later support the reverse dashboard described in [SPEC.md](../SPEC.md).

## Product model

| Part                   | Role                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Auth.ax library        | Runs authentication in the application                                                          |
| Application database   | Owns users and remains the source of truth                                                      |
| Console delivery       | Lets an agent verify an OTP flow locally without an Auth.ax account                             |
| Auth.ax hosted service | Provides optional operational capabilities without becoming the authority for application users |
| Customer server        | Performs every authoritative mutation of application users                                      |

## Product promise

- The library works without the hosted service.
- An agent can install and verify authentication locally without an account or external setup.
- One developer confirmation enables real OTP email delivery.
- The agent performs the mechanical setup around that confirmation.
- Applications can replace Auth.ax delivery with any compatible delivery adapter.
- Future dashboard capabilities observe and operate on the application database without replacing it as the source of truth.

## Version one

### Purpose

- Let a developer enable real OTP email delivery without configuring an email provider or DNS.
- Give Auth.ax a durable account that can own applications and sending keys.
- Make abusive accounts and all of their keys blockable as one principal.
- Establish the account and application foundation for later hosted capabilities.

### Experience

| Situation                                   | Delivery                  | Auth.ax account | Human action                                               |
| ------------------------------------------- | ------------------------- | --------------- | ---------------------------------------------------------- |
| Local verification by the developer         | Console                   | Not required    | None                                                       |
| Local or tunneled demo used by other people | Auth.ax email delivery    | Required        | Confirm GitHub OAuth once                                  |
| Hosted application using Auth.ax delivery   | Auth.ax email delivery    | Required        | Add the sending key to the hosting provider secret storage |
| Application using its own delivery provider | Customer supplied adapter | Not required    | Configure the chosen provider                              |

### Activation flow

1. The agent installs Auth.ax and verifies the OTP flow with console delivery.
2. The developer asks for real OTP email delivery.
3. The agent starts Auth.ax activation and opens the authorization page.
4. The developer authenticates through GitHub OAuth.
5. Auth.ax verifies that the GitHub account is at least six months old.
6. Auth.ax creates or reuses the account and creates or selects an application.
7. Auth.ax issues a sending key for the application.
8. The activation process returns the key to the agent.
9. The agent stores the key outside source control and configures the application.
10. The application sends real OTP email messages through Auth.ax.

### Deployment flow

1. The same application and sending key may be used for deployment.
2. The sending key is added to the hosting provider secret storage.
3. The agent performs this step when it has the required access.
4. Otherwise the agent gives the developer the exact provider specific action to complete.

### Hosted capabilities

| Capability             | Version one behavior                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Account access         | Authenticate the developer through GitHub OAuth                                           |
| Application management | Create and select applications owned by the account                                       |
| Sending key management | Issue, list, and revoke application sending keys                                          |
| OTP email delivery     | Send only the fixed Auth.ax OTP email message                                             |
| Enforcement            | Apply limits across every application and key owned by the GitHub identity                |
| Account suspension     | Stop delivery and revoke the usefulness of every sending key owned by the blocked account |

### Service records

| Record           | Purpose                                                                 | Authority            |
| ---------------- | ----------------------------------------------------------------------- | -------------------- |
| Account          | Represents the developer who authenticated with GitHub                  | Auth.ax              |
| Application      | Groups hosted capabilities and credentials for one customer application | Auth.ax              |
| Sending key      | Authenticates an application to the OTP email delivery service          | Auth.ax              |
| Sending activity | Supports limits, abuse response, and operational diagnosis              | Auth.ax              |
| Application user | Not stored as an authoritative record in version one                    | Customer application |

### Initial sending policy

| Restriction                 | Limit                                                                                                | Scope                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| GitHub account age          | At least six months                                                                                  | Per GitHub identity           |
| Email addresses             | 250 distinct email addresses¹                                                                        | Per GitHub identity, lifetime |
| Email messages              | 1,000 OTP email messages                                                                             | Per GitHub identity, per day  |
| Key expiry                  | None                                                                                                 | Per sending key               |
| Email message type          | OTP only                                                                                             | Per email message             |
| Email message customization | Fixed sender email address, subject, and template with no caller controlled copy, links, or branding | Per email message             |

¹ Email addresses are lowercased before comparison. Suffixes and periods are preserved. `user+one@gmail.com`, `user@gmail.com`, and `u.ser@gmail.com` are distinct email addresses.

### Accountability and abuse controls

| Control                | Effect                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| GitHub OAuth           | Establishes a durable principal rather than a real world identity |
| GitHub account age     | Raises the cost of replacing a blocked principal                  |
| Identity scoped limits | Prevents new applications and keys from resetting sending limits  |
| Fixed OTP template     | Removes caller controlled content used for spam and phishing      |
| Account suspension     | Blocks the principal and every sending key it owns                |
| Key revocation         | Stops a compromised or retired application credential             |

### Remaining risks

| Risk                              | Impact                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| Unwanted OTP email messages       | Recipients may form a negative opinion of Auth.ax                     |
| Sending cost                      | Auth.ax pays for accepted email messages                              |
| Invalid recipients and spam traps | Providers may reduce or block delivery from Auth.ax                   |
| Compromised GitHub accounts       | An attacker may inherit the eligibility and reputation of the account |

### Not in version one

- Anonymous sending keys
- General email delivery
- Caller controlled email copy, links, branding, senders, or templates
- Custom sending domains
- User projections in the hosted dashboard
- Dashboard mutation endpoints
- Team and organization accounts
- Billing
- Automatic integration with hosting provider secret storage
- GitHub OAuth as an authentication method for the customer application's users

## Reverse dashboard direction

### Purpose

- Give technical and nontechnical operators a useful user dashboard without moving user authority out of the application.
- Let an application opt into individual management operations without adopting an Auth.ax user model.
- Keep authentication independent from the availability of the dashboard.

### Read flow

| Step | Behavior                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 1    | The application reports explicit events and selected user information to Auth.ax                     |
| 2    | Auth.ax builds a dashboard projection from the reported information                                  |
| 3    | Operators inspect users, authentication activity, and application supplied properties                |
| 4    | The application database remains authoritative when the projection is missing, stale, or unavailable |

### Mutation flow

| Step | Behavior                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 1    | The developer registers a protected application endpoint for a predefined operation such as disabling a user |
| 2    | Auth.ax enables the corresponding dashboard control                                                          |
| 3    | An operator invokes the control for an application user                                                      |
| 4    | Auth.ax sends a signed HTTP request with the predefined payload to the registered endpoint                   |
| 5    | The customer server validates the request and decides whether to perform the mutation                        |
| 6    | The customer server mutates its own database                                                                 |
| 7    | The application confirms the result and reports the resulting state to Auth.ax                               |
| 8    | Auth.ax updates the dashboard projection                                                                     |

### Invariants

- Auth.ax never directly mutates the application database.
- A dashboard control is unavailable until the application explicitly enables its operation.
- The customer server authorizes every requested mutation.
- Auth.ax does not treat a requested mutation as successful before the customer server confirms it.
- Dashboard projections never become the source of truth for application users.
- Dashboard downtime does not prevent the application's local authentication mechanisms from operating.

## Open product decisions

| Decision               | Question                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| Repository and license | Which hosted components are public, and does Auth.ax promise self hosting      |
| Activation handoff     | How does browser authorization return the sending key to the agent safely      |
| Application ownership  | Does version one support one application or multiple applications per account  |
| Key lifecycle          | Which rotation and replacement operations are required beyond issue and revoke |
| Deployment setup       | Which hosting providers can an agent configure directly                        |
| Stored sending data    | What recipient and delivery data is retained, in what form, and for how long   |
| Dashboard reporting    | Which data is explicit, optional, and safe to copy into the hosted projection  |
| Dashboard commands     | How requests are authenticated, retried, made idempotent, and reconciled       |
