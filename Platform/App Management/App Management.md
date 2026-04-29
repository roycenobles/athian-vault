# App Management

Provides platform-wide application configuration services. Currently scoped to **feature flag management** — exposing runtime flags that control frontend feature availability across the platform.

![[Platform/App Management/_draw.io/overview.drawio.png|650]]
## API

All routes require JWT authorization via the platform's [[Auth Platform|Policy Enforcement Point]].

| Method | Path | Description |
|--------|------|-------------|
| GET | `/feature-flags` | Returns all feature flags |
| GET | `/feature-flags/{featureFlagId}` | Returns a single flag by name |

### Feature Flag

```typescript
FeatureFlagDto {
  name: string;   // flag identifier
  value: string;  // boolean as string ("true" / "false")
}
```

## Feature Flags

Flags are resolved from Lambda environment variables, defaulting to `false`.

| Flag Name | Description |
|-----------|-------------|
| `showNewComponentExperience` | Enables new component UX |
| `showAlertBanner` | Shows the alert banner |
| `showNewCsv` | Enables new CSV functionality |

## Infrastructure

- **Runtime**: Single AWS Lambda function (Node.js) behind an HTTP API Gateway
- **Auth**: `PolicyEnforcementPoint` Lambda authorizer — validates JWTs against the [[Auth Platform]] API
- **Storage**: None — flags are stateless, driven by environment variables
- **SSM**: Publishes API endpoint as `APP_MGMT.PARAMS.APPMGMTAPI` for consumption by other services

## Architecture

Follows the platform's hexagonal pattern: API Gateway → primary adapter → use case. No secondary adapters (no database or external service calls).
