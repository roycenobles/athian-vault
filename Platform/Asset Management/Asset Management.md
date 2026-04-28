# Asset Management

Manages the full lifecycle of sustainability assets — from creation at monitoring period approval through claiming by downstream buyers. Tracks two asset types: **AVSA** (Audited Verified Sustainability Asset, from verified monitoring periods) and **NAVSA** (Not-Audited/Verified Sustainability Asset, from non-verified periods). Maintains supply shed availability projections so buyers can see what assets are available from their upstream partners.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Asset Bundle** | A set of sustainability assets created when a monitoring period is approved. Scoped to a producer, protocol, and monitoring period. Tracks total assets, claimed, and remaining. |
| **Claim** | A buyer's purchase of assets from a specific partner connection. Supports co-claiming (multiple participants sharing a single claim). |
| **Partner Availability** | A projection record representing the supply shed link between a buyer and an upstream partner — includes product allocation, partner regions, contracts, and bundle availability. |
| **Bundle Availability** | Per-bundle slice of a partner availability record; records which bundles are visible and claimable for a given buyer/partner pair. |
| **Supply Shed** | The aggregated view of all available assets across all upstream partners, broken down by partner → region → protocol. |

## Domain Model

```
AssetBundleDto
  producerOrganizationId: uuid
  bundleCode: string
  assets / assetsClaimed / assetsRemaining: number
  assetType: AssetType           ← AVSA | NAVSA
  protocolId / protocolName / protocolVintage
  interventionId / interventionCode
  monitoringPeriodId / monitoringPeriodCode
  observationStartDate / observationStopDate
  approvalDate: string
  assetClaims: AssetClaimDto[]

ClaimDto
  buyerOrganizationId / buyerOrganizationName: string
  partnerOrganizationId / partnerOrganizationName: string
  partnerRegion: string
  partnerRegionStatesOrProvinces: string[]
  assetClaims: AssetClaimDto[]
  assetRequests: AssetRequestDto[]
  isCoClaim?: boolean

AssetClaimDto
  bundleId / claimId: uuid
  assetsClaimed: number
  currency: CurrencyType
  unitCost / producerPaymentPerAsset: number
  contractId: uuid
  hasParticipants: boolean
  participants: ParticipantDto[]

PartnerAvailabilityDto                ← availability-table
  connectionId / producerOrganizationId / buyerOrganizationId / partnerOrganizationId: uuid
  partnerRegions: NonProducerPartnerRegion[]
  startDate / endDate?: string
  productAllocation: number           ← percentage allocated from producer
  productAllocationLocationId / productAllocationStateOrProvince: string
  streamDetails: SupplyShedPartnerDto[]
  bundleAvailability: BundleAvailabilityDto[]
  contracts: PartnerContractDto[]
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/api/asset-bundles/{assetBundleId}` | Get a single asset bundle |
| GET | `/v2/api/interventions/{interventionId}/monitoring-periods/{monitoringPeriodId}/asset-bundles` | Get bundles for a monitoring period |
| POST | `/v2/api/organizations/{organizationId}/partners/{partnerId}/claims` | Create a claim |

The following functions are invoked directly via Lambda ARN (no API Gateway route):

| SSM Key | Description |
|---------|-------------|
| `GET_ASSET_BUNDLES_BY_PRODUCER_ID_FUNCTION_ARN` | Get bundles by producer, intervention, or monitoring period |
| `GET_CLAIMS_BY_BUYER_ID_FUNCTION_ARN` | Get claims for a buyer organization |
| `GET_SUPPLY_SHED_AVAILABLE_ASSETS_FUNCTION_ARN` | Get all available assets across an org's supply shed (3008 MB, 30s timeout) |

The API endpoint is published as `ASSETMGMTAPI`.

## Lambda Functions

### Event Functions

| Function | Event(s) | Responsibility |
|----------|----------|----------------|
| `on-mp-approved-events-fn` | `MonitoringPeriodApprovedEvent` | Creates an asset bundle when a monitoring period is approved |
| `on-asset-bundle-created-fn` | `AssetBundleCreated` (domain-internal) | Updates bundle availability records for all connected downstream buyers |
| `on-supply-shed-events-fn` | `SupplyShedModifiedEvent`, `SupplyShedDeletedEvent` | Creates/updates partner availability records from supply shed changes |
| `on-contract-events-fn` | `ContractCreatedEvent`, `ContractUpdatedEvent`, `ContractDeletedEvent` | Syncs partner contracts into the availability table |
| `on-org-update-events-fn` | `OrganizationUpdatedEvent` | Syncs org name changes into asset and availability records |

### API / Direct-Invocation Functions

| Function | Type | Responsibility |
|----------|------|----------------|
| `get-asset-bundle-fn` | API | Single bundle retrieval |
| `asset-bundle-actions-fn` | API | Bundles by monitoring period |
| `claim-actions-fn` | API | Claim creation |
| `get-asset-bundles-by-producer-fn` | Lambda ARN | Bundles by producer / intervention / monitoring period |
| `get-claims-by-buyer-fn` | Lambda ARN | Claims for a buyer org |
| `get-supply-shed-available-assets-fn` | Lambda ARN | Full supply shed asset view for an org |
| `dynamo-stream-processor-fn` | DDB stream | Archives stream records from both tables → S3 audit bucket |
| `data-migration` | EventBridge-driven | Data migration process (current) |

## Events

### Published (to default event bus)

| Event | Trigger |
|-------|---------|
| `asset-bundle-created` | Monitoring period approved → bundle created |
| `claim-created` | Claim successfully created |

### Consumed (from default event bus)

| Event | Source | Handler |
|-------|--------|---------|
| `monitoring-period-approved` | [[Interventions]] | `on-mp-approved-events-fn` — creates asset bundle |
| `asset-bundle-created` | Asset Management (self) | `on-asset-bundle-created-fn` — updates bundle availability |
| `supply-shed-modified` / `supply-shed-deleted` | [[Organizations]] | `on-supply-shed-events-fn` — syncs partner availability |
| `contract-created/updated/deleted` | [[Organizations]] | `on-contract-events-fn` — syncs partner contracts |
| `organization-updated` | [[Organizations]] | `on-org-update-events-fn` — syncs org names |

## Infrastructure

- **DynamoDB** `assets-table` — asset bundles, claims, asset-claims, participants (single-table design); DynamoDB streams enabled
- **DynamoDB** `availability-table` — partner availability, bundle availability, partner contracts; DynamoDB streams enabled
- **S3** audit bucket — DynamoDB stream archive with object lock (immutable audit trail)
- **KMS** — customer-managed key for tables (when analytics enabled)
- **DataLakeStack** — Glue Zero-ETL for `assets-table` → analytics account (when analytics enabled)
- **CloudWatch alarms** — on errors in all event Lambda functions → SNS → email distribution list
- **SSM** — publishes `ASSETMGMTAPI`, `GET_ASSET_BUNDLES_BY_PRODUCER_ID_FUNCTION_ARN`, `GET_CLAIMS_BY_BUYER_ID_FUNCTION_ARN`, `GET_SUPPLY_SHED_AVAILABLE_ASSETS_FUNCTION_ARN`

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | JWT authorization via PEP/PDP |
| [[Interventions]] | Consumes `MonitoringPeriodApprovedEvent` to create asset bundles |
| [[Organizations]] | Consumes supply shed, contract, and org-update events to maintain availability projections |
