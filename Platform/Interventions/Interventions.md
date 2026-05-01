# Interventions

The core domain service. Manages the full lifecycle of sustainability interventions — from creation through data collection to third-party verification and completion. Governs producers, verifiers (VVBs), monitoring periods, baselines, and all associated protocol-specific data.
![[Platform/Interventions/_draw.io/overview.drawio.png]]
## Core Concepts

| Entity | Description |
|--------|-------------|
| **Intervention** | A sustainability project at a producer location, governed by a protocol. The top-level aggregate. |
| **Monitoring Period** | A time-bounded period within an active intervention where data is collected and submitted for verification. |
| **Baseline** | Pre-intervention environmental measurements used for emissions reduction calculations. |
| **Component** | Protocol-specific data fields within a monitoring period or baseline. Submitted by producers, reviewed by verifiers. |
| **Issue** | A deficiency raised by a verifier against a monitoring period or baseline component. |
| **Assignment** | Links a verifier organization to an intervention. |

## Status Lifecycles

**Intervention**
```
Pending → Active → Finalizing → Completed
                              → Cancelled
```

**Monitoring Period / Baseline** (shared lifecycle)
```
In Progress → Needs Action → Needs Review → In Review → Approved
                                                       → Declined
                                          → Cancelled
```

**Component compliance**
```
Needs Review → In Review → Reviewed
                         → Confirmed | Refuted | Inconclusive  (legacy)
```

## Domain Model

```
Intervention
  protocolId, producerId, locationId: uuid
  verifierId?: uuid
  primaryContactId?: uuid
  verifierContactId?, verifierPeerContactId?: uuid
  status: InterventionStatus
  code: string                    ← system-generated identifier
  applicationStart: date
  applicationStop?: date
  demographics: Demographics[]    ← protocol-specific demographics
  autoCreateMonitoringPeriods: boolean
  isPilot: boolean
  monitoringPeriods: MonitoringPeriod[]
  baselines: Baseline[]

MonitoringPeriod / Baseline
  monitoringStart / stop: date
  status: PeriodStatus
  assuranceLevel?: Limited | Reasonable
  finalOpinion?: string
  calculatedReduction?: number
  calculatedReductionUnit?: MT_CO2e | kg_CO2e
  earnedAVSA?: number
  components: Component[]
  issues: Issue[]
```

## API

All routes are under `/v2/api` (or `/v3/api` for component/baseline-component endpoints). Three route hierarchies reflect the three personas:

### Producer routes — `/v2/api/producers/{producerId}/...`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/interventions` | List interventions by producer |
| GET | `/locations/{locationId}/interventions` | List by location |
| POST | `/locations/{locationId}/interventions` | Create intervention |
| GET/PATCH/DELETE | `/locations/{locationId}/interventions/{interventionId}` | Manage intervention |
| GET/POST | `.../interventions/{interventionId}/monitoring-periods` | List/create monitoring periods |
| GET/PATCH/DELETE | `.../monitoring-periods/{monitoringPeriodId}` | Manage monitoring period |
| GET/POST | `.../interventions/{interventionId}/baselines` | List/create baselines |
| GET/PATCH/DELETE | `.../baselines/{baselineId}` | Manage baseline |
| GET/PATCH | `.../monitoring-periods/{monitoringPeriodId}/components/{componentId}` | Component (v2) |
| GET/PUT/PATCH | `/v3/.../monitoring-periods/{monitoringPeriodId}/components[/{id}]` | Components (v3, bulk update) |
| GET/PUT/PATCH | `/v3/.../baselines/{baselineId}/baseline-components[/{id}]` | Baseline components (v3) |
| CRUD | `.../components/{componentId}/comments` | Comments on components |

### Verifier routes — `/v2/api/verifiers/{verifierId}/...`

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/interventions[/{interventionId}]` | List/manage assigned interventions |
| GET/PATCH | `.../monitoring-periods[/{id}]` | Manage monitoring periods |
| CRUD | `.../monitoring-periods/{id}/issues` | Raise/manage issues |
| GET/PATCH | `.../baselines[/{id}]` | Manage baselines |
| CRUD | `.../baselines/{id}/baseline-issues` | Raise/manage baseline issues |
| GET/PATCH | Components and baseline-components (v2 + v3) | |

### Admin routes — `/v2/api/interventions/{interventionId}/...`

GET/PATCH/DELETE on interventions, monitoring periods, and baselines without producer/location scoping.

### Search — `/v3/search/interventions`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v3/search/interventions` | Search interventions |
| POST | `/v3/search/interventions/index` | Trigger re-index |

## Lambda Functions

| Function | Type | Responsibility |
|----------|------|----------------|
| `producer-actions` | API | Producer-scoped CRUD |
| `verifier-actions` | API | Verifier-scoped CRUD + issues |
| `intervention-actions` | API | Intervention + monitoring period management |
| `monitoring-period-actions` | API | Monitoring period management (producer + admin) |
| `baseline-actions` | API | Baseline + baseline-issue management |
| `component-actions` | API | Component v2 + comments |
| `component-v3-actions` | API | Component v3 (list, bulk update) |
| `baseline-component-actions` | API | Baseline components v3 |
| `admin-actions` | API | Admin-scoped intervention management |
| `search-v3` | API + Events | Search index + query |
| `component-events` | Events | Listens for component changes, syncs operational data |
| `baseline-component-events` | Events | Listens for baseline component changes |
| `op-data-events` | SQS | Processes operational data updates from queue |
| `organization-events` | Events | Syncs organization changes into intervention data |
| `intervention-scheduled` | Scheduled | Daily: evaluate intervention status auto-transitions |
| `monitoring-period-scheduled` | Scheduled | Daily: auto-create next periods, evaluate status, send reminders |
| `monitoring-period-notifications` | Events | Sends monitoring period lifecycle notifications |
| `baseline-notifications` | Events | Sends baseline lifecycle notifications |
| `intervention-notifications` | Events | Sends intervention lifecycle notifications |
| `data-import` | Process | Bulk data import workflow |

Scheduled functions run daily at **05:00 UTC**.

## Events

### Published
| Event | Trigger |
|-------|---------|
| `intervention-created/updated/launched/deleted` | Intervention lifecycle changes |
| `monitoring-period-created/updated/approved/declined/deleted` | Monitoring period lifecycle |
| `baseline-created/updated/approved/declined/deleted` | Baseline lifecycle |
| `create-next-monitoring-periods` | Scheduled: auto-create next period |
| `send-monitoring-period-notifications` | Scheduled + status transitions |
| `send-baseline-notifications` | Scheduled + status transitions |

### Consumed
- Organization events (from [[Identities]]) — syncs org/contact data into intervention records
- Component/baseline-component events — triggers operational data sync

## Infrastructure

- **DynamoDB** `intervention-table` — single-table design, all entities
- **EventBridge** `interventions-event-bus` — domain-internal event bus
- **SQS** `op-data-queue` + DLQ — decoupled operational data processing (3-min visibility timeout, 1-day DLQ retention)
- **CloudWatch alarms** — on SQS DLQ depth, SNS email to distribution list
- **DataLakeStack** — Glue Zero-ETL integration from DynamoDB → analytics account Glue catalog (when analytics enabled)
- **KMS** — customer-managed key with Glue access (when analytics enabled)
- **SSM** — publishes API endpoint as `INTERVENTIONS.PARAMS.API_v2`

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | JWT authorization + s2s token for operational data calls |
| [[Operational Data]] | Syncs component/baseline data via API |
| [[Notifications]] | Delivers lifecycle email/websocket notifications |
| [[Documents]] | Documents are attached to monitoring periods and baselines |
