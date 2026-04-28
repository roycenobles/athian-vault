# Identities

The central authentication, authorization, and identity management service for the platform. All other services delegate authorization decisions here via the [[#Policy Decision Point (PDP)]].

## Responsibilities

- **Authentication**: Cognito-hosted user login with custom UI and email templates
- **Authorization**: OPA policy engine (compiled to WASM) evaluates every API request platform-wide
- **Identity management**: Organizations, Users, Contacts, and Grants (role assignments)
- **JWT enrichment**: Pre-token trigger adds identity context claims to Cognito tokens
- **Service-to-service auth**: Machine-to-machine integration client with automatic token rotation

## Domain Model

```
User
  authId: uuid        ← Cognito sub
  email: string
  contacts: Contact[]

Contact
  organizationId: uuid
  firstName, lastName: string
  email: string
  phone?: string
  isPrimary: boolean
  grant?: Grant       ← the contact's active role in the org

Grant
  role: Owner | Manager | Member
  isActive: boolean
  → links User ↔ Contact ↔ Organization

Organization
  name: string
  type: CPG | Processor | Producer | Retailer | Verifier | Admin
  isActive: boolean
  contacts: Contact[]
```

`UserContext` is a read projection injected into JWTs — it captures the user's active organization at login time:

```
UserContext
  userId, contactId: uuid
  firstName, lastName: string
  organization: { id, name, type }
```

## API

All routes require JWT authorization.

### Organizations

| Method | Path | Description |
|--------|------|-------------|
| GET/HEAD | `/v1/api/organizations/{organizationId}` | Get organization |
| GET | `/v1/api/organizations/{organizationId}/contacts` | List contacts |
| POST | `/v1/api/organizations/{organizationId}/contacts` | Create contact |
| GET | `/v1/api/organizations/{organizationId}/contacts/{contactId}` | Get contact |
| PUT | `/v1/api/organizations/{organizationId}/contacts/{contactId}` | Update contact |
| DELETE | `/v1/api/organizations/{organizationId}/contacts/{contactId}` | Delete contact |
| POST | `/v1/api/organizations/{organizationId}/contacts/{contactId}/grants` | Create grant |
| PUT | `/v1/api/organizations/{organizationId}/contacts/{contactId}/grants/{grantId}` | Update grant |

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/api/users/{userId}/contexts` | List all org contexts for a user |
| POST | `/v1/api/users/{userId}/invitations` | Resend invitation email |

## Policy Decision Point (PDP)

The PDP is a Lambda function that validates requests platform-wide. Every other service runs a `PolicyEnforcementPoint` Lambda authorizer that calls the PDP before allowing any request through.

**Flow:**
1. Incoming request hits a service's API Gateway
2. `PolicyEnforcementPoint` (per-service Lambda authorizer) calls the PDP with: `{ authorization: "Bearer <token>", httpPath, httpMethod }`
3. PDP verifies the JWT via Cognito and evaluates the OPA policy
4. PDP returns: `{ authorized: bool, context: { userId, authId, email, firstName, lastName, roles } }`
5. The `context` is attached to the request and forwarded to the Lambda handler

**OPA policy engine**: Policies are compiled to a single `policy.wasm` binary. Per-service policies exist for: `app-mgmt`, `auth-platform`, `interventions` (v1/v2/v3), `organizations`, `producers`, `protocols`, `vvbs`, `webappapi`, `operationaldata`. Two global rules always allow: `is_admin` (Cognito Admin group) and `is_automation` (client credentials scope).

**PDP endpoint** is published to SSM as `AUTH_PLATFORM.PARAMS.API` and consumed by all service `PolicyEnforcementPoint` authorizers.

## JWT Enrichment (Pre-token Trigger)

A Cognito pre-token generation trigger runs on every login and injects identity context into the JWT:

| Claim | Value |
|-------|-------|
| `user_id` | Internal user UUID |
| `user_first_name` / `user_last_name` | From the user's primary contact |
| `context_id` | Active organization UUID |
| `context_type` | Organization type (e.g. `Verifier`, `Producer`) |
| `context_name` | Organization name |
| `has_multiple_contexts` | `"true"` if user belongs to multiple orgs |

Admin users get a synthetic `Athian, Inc.` context prepended to their list.

## Infrastructure

The CDK app deploys across four stacks — V1 handles Cognito setup, V2 adds the identity data layer and API. V1 is expected to be consolidated into V2 over time.

### V1 — Cognito Setup (Stateful)
- Cognito User Pool with custom domain (`{stage}.{domain}`)
- `UserPoolClient` — user-facing OAuth (authorization code grant)
- `IntegrationClient` — machine-to-machine (client credentials, `automation` scope)
- `CognitoCustomizer` — custom hosted UI (logo, CSS)
- `CognitoEmailTrigger` — branded invitation and password reset emails
- Secrets Manager: integration token holder + integration client secret
- SSM: `POOL_ID`, `CLIENT_ID`, `INTEGRATION_CLIENT_ID`, `INTEGRATION_SECRET_TOKEN_ARN`, `INTEGRATION_CLIENT_SECRET_ARN`

### V1 — Stateless
Currently empty (placeholder).

### V2 — Stateful
- DynamoDB `identity-table` — single-table design, 2 GSIs (`gsi_1`, `gsi_2`)
- EventBridge `identity-event-bus` — internal events from this service
- `PretokenTriggerFunction` — Cognito pre-token generation trigger (JWT enrichment)

### V2 — Stateless
- `IdentityApi` — HTTP API Gateway, no default authorizer (PDP is invoked directly)
- `OrganizationActionsFunction` — org/contact/grant CRUD, publishes to default event bus
- `OrganizationEventsFunction` — consumes identity event bus, republishes to default bus
- `UserActionsFunction` — user contexts + invitation resend
- `PolicyDecisionPoint` — PDP Lambda, invoked by all service authorizers
- `TokenRotationEventFunction` — exchanges client credentials for a new s2s token
- `RotateTokenRule` — EventBridge cron: fires every 4 hours to trigger token rotation
- `DomainConfigFunction` — CDK custom resource, seeds domain-level organization config on deploy
- SSM: `AUTH_PLATFORM.PARAMS.API` (PDP endpoint)

## Events

Published to the default EventBridge bus:

| Event | Trigger |
|-------|---------|
| `contact-created` | New contact added to an org |
| `contact-updated` | Contact details changed |
| `contact-deleted` | Contact removed from an org |
| `grant-created` | New role assignment |
| `grant-updated` | Role or active status changed |
| `token-rotation-trigger` | S2S token rotation (scheduled + on-demand) |
