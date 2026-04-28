# Organizations

Manages the supply chain graph for the platform: organizations, their locations, inter-org connections, and commercial contracts. Also derives and maintains the **supply shed** — the full upstream/downstream connection tree for any org.

## Core Concepts

| Entity | Description |
|--------|-------------|
| **Organization** | A supply chain participant typed by business unit. Carries type-specific `details` (protocol support, producer types, etc.). |
| **Location** | A physical address belonging to an org; can carry protocol configuration for intervention eligibility. |
| **Connection** | A directed link between an upstream and downstream org, with emission allocation configuration per side. |
| **Contract** | A protocol-specific commercial agreement between two connected orgs; has a start/end date and auto-expires. |
| **Supply Shed** | Derived projection of the full connection tree — used for emissions calculations. Maintained reactively via connection events. |

**Business unit types**: `Producer`, `Processor`, `CPG`, `Retailer`, `Verifier` (Wholesaler and Distributor planned)

## Domain Model

```
Organization<T>
  name: string
  businessUnit: BusinessUnitTypesEnum
  supportedCountries: SupportedCountries[]
  primaryLocationCity / primaryLocationStateOrProvince: string
  organizationType: string       ← names the shape of `details`
  details: T                     ← ProducerOrganizationDetailsV1 | VerifierOrganizationDetailsV1
  isActive: boolean
  hubSpotId?: string

Location
  organizationId: uuid
  name, address, city, stateOrProvince, postalCode: string
  country: SupportedCountries
  isPrimary / isBilling: boolean
  productType?: ProducerTypesEnum
  protocolConfiguration?: { protocolId, protocolName, allowMultipleInterventions }[]

Connection
  upstreamPartnerId / downstreamPartnerId: uuid
  upstreamBusinessUnit / downstreamBusinessUnit: BusinessUnitTypesEnum
  downstreamConfiguration: ConnectionProducerConfigurationV1 | ConnectionNonProducerConfigurationV1
  upstreamConfiguration: ConnectionNonProducerConfigurationV1

Contract
  connectionId: uuid
  upstreamPartnerId / downstreamPartnerId: uuid
  protocolId / protocolName / protocolVintage
  pricePerUnit / producerPaymentPerUnit / contractAmount
  unit: AVSA | ...
  startDate / endDate: string
  status: ContractStatus
  isCoClaimingEnabled: boolean
```

## API

### Organizations

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/v1/api/organizations` | List / create organizations |
| GET/PUT/PATCH | `/v1/api/organizations/{id}` | Get / update organization (delete not supported) |
| GET | `/v1/search-api/organizations` | Search organizations (paginated) |
| GET | `/v1/search-api/organizations-summary` | Search with location summary |
| GET | `/v1/search-api/organizations/{organizationId}/organizations-summary` | Summary for a specific org |

### Locations

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/v1/api/organizations/{organizationId}/locations` | List / create locations |
| GET/PUT/PATCH | `/v1/api/organizations/{organizationId}/locations/{id}` | Get / update location |
| GET | `/v1/api/locations` | Admin: list locations (read-only) |

### Connections

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/v1/api/connections` | Admin: list / create connections |
| GET/PUT/PATCH/DELETE | `/v1/api/connections/{id}` | Admin: manage connection |
| GET | `/v1/api/organizations/{organizationId}/downstream-connections[/{id}]` | Downstream view |
| GET | `/v1/api/organizations/{organizationId}/upstream-connections[/{id}]` | Upstream view |

### Contracts

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/v1/api/contracts` | Downstream: list / create contracts |
| GET/PUT/PATCH/DELETE | `/v1/api/contracts/{id}` | Downstream: manage contract |
| GET/POST | `/v1/api/organizations/{organizationId}/upstream-contracts` | Upstream: list / create contracts |
| GET/PUT/PATCH | `/v1/api/organizations/{organizationId}/upstream-contracts/{id}` | Upstream: manage contract |
| POST | `/v1/admin-api/contract-expiration` | Admin: manually trigger expiration evaluation |

## Lambda Functions

| Function | Type | Responsibility |
|----------|------|----------------|
| `organizations` | API | Organization CRUD |
| `search-organizations` | API | Paginated org search |
| `search-organizations-summary` | API | Org + location summary search |
| `locations` | API | Location CRUD (org-scoped) |
| `locations-admin` | API | Admin read-only locations |
| `connections-admin` | API | Admin connection CRUD |
| `connections-downstream` | API | Downstream connection view |
| `connections-upstream` | API | Upstream connection view |
| `contracts` | API | Downstream contract CRUD |
| `contracts-upstream` | API | Upstream contract CRUD |
| `contract-exp-trigger-gw-fn` | API | Admin-triggered contract expiration |
| `contract-exp-trigger-event-fn` | Scheduled | Daily: evaluates and marks expired contracts |
| `on-connection-events-function` | Events | Listens for connection changes; updates connections projection + publishes supply shed events |
| `on-org-deactivated-event` | Events | Deactivates associated connections when org is deactivated |
| `on-org-updated-event-fn` | Events | Syncs org name changes into contracts |
| `seed-data` | CDK custom resource | Data migration / seed |

## Events

### Published (to default event bus)
| Event | Trigger |
|-------|---------|
| `organization-created/updated/deactivated/reactivated` | Org lifecycle |
| `location-created/updated` | Location lifecycle |
| `connection-created/updated/deleted` | Connection lifecycle |
| `contract-created/updated/deleted/expired` | Contract lifecycle |
| `supply-shed-modified/deleted` | Connection change (derived) |

### Consumed (from organizations event bus)
| Event | Handler |
|-------|---------|
| Connection events | `on-connection-events-function` — rebuilds supply shed projection |
| Org deactivated | `on-org-deactivated-event` — cascades deactivation to connections |
| Org updated | `on-org-updated-event-fn` — syncs org name into contracts |

## Infrastructure

- **DynamoDB** `organizations-table` — org records
- **DynamoDB** `locations-table` — location records
- **DynamoDB** `connections-projection-table` — denormalized connection/supply shed projection
- **DynamoDB** `contracts-table` — contract records
- **DynamoDB** `audit-table` — audit trail for all mutations
- **EventBridge** `organizations-event-bus` — domain-internal event bus
- **DataLakeStack** — Glue Zero-ETL for `organizations-table` and `contracts-table` → analytics account (when analytics enabled)
- **KMS** — customer-managed key for all tables (when analytics enabled)
- **SSM** — publishes API endpoint as `ORGANIZATIONS.PARAMS.API`

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | JWT authorization via PEP/PDP; Cognito user pool for API authorizer |
| Protocols | Validates protocol IDs on location and contract creation |
