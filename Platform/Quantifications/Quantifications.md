# Quantifications

Runs protocol-specific GHG emissions calculations against monitoring period data and produces quantified results (Jobs). Supports two modes: automated calculation triggered by monitoring period lifecycle events, and ad-hoc scenario calculations invoked via API. Currently implements one calculator: the **AMMP** (Anaerobic Manure Management Protocol).

## Flow

### Automated (event-driven)

```
MonitoringPeriodCreated / MonitoringPeriodUpdated
  → mp-events-fn
      sends MonitoringPeriodDto to mp-queue.fifo

MonitoringPeriodApproved / BaselineApproved
  → mp-events-fn
      resolves next eligible monitoring period
      sends it to mp-queue.fifo as MonitoringPeriodUpdated

mp-queue.fifo
  → mp-queue-worker-fn
      idempotency check: skip if periodLastUpdated unchanged since last Job
      precondition check: baseline must be Approved; previous MP (if any) must be Approved
      runs calculator for protocolId
      saves Job to DynamoDB
      stores calculation report to S3
```

### Ad-hoc (via API)

```
POST /v1/api/scenarios  (or monitoring-period-scoped variant)
  → scenario-actions-fn / scenario-period-actions-fn
      runs calculateDirect — does not persist changes to monitoring period
      returns calculation output immediately
```

## Domain Model

```
JobDto
  contactId / organizationId: uuid
  monitoringPeriodId?: uuid
  periodLastUpdated: string       ← used for idempotency
  input: any                      ← calculator input (AmmpInput for AMMP)
  output?: any                    ← raw calculation output
  report: any                     ← formatted report stored in S3
  emissions?: any                 ← emissions breakdown
  status: JobStatus               ← "success" | "failure"

ScenarioDto
  protocolId: uuid
  data: any                       ← protocol-specific scenario input
```

## AMMP Calculator

The `AmmpInput` structure fed into the AMMP calculator:

```
AmmpInput
  baseline: PeriodInformation     ← period-level data without totalNumberOfAnimals
  project: PeriodInformation
  groups: CattleGroup[]

PeriodInformation
  averageTemperatureC: number
  daysInPeriod: number
  electricityMwh: number
  fuel: FuelUsage[]

CattleGroup (per demographic)
  type: LACTATING_FREESTALL | LACTATING_OPEN_LOT | BEEF_STEERS | BULLS | DRY | HEIFERS
  baseline / project: GroupInformation
    averageNumberOfAnimals, dryMatterIntakeKg, percentOfCrudeProteinInDiet
    percentOfGrainInDiet, percentAshContentInDiet, deInDiet
    previousVolatileSolidsAvailableKg, previousVolatileSolidsDegradedKg
    systems: SystemUsage[]
    [lactating only] averageMilkProductionPerDayKg, percentOfProteinInMilk
```

**Equations computed**: methane from manure liquids (VS-based), methane from manure solids, direct N₂O, indirect N₂O (volatilization + leaching), emissions from electricity, emissions from fuel, baseline emissions total, project emissions total, **net change** (MT CO₂e).

Calculators are pluggable by `protocolId`. The `Calculator` interface exposes `canCalculate`, `calculate` (async, with idempotency), and `calculateDirect` (synchronous, scenario-only).

## API

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/v1/api/scenarios` | `scenario-actions` | List scenarios by contact |
| POST | `/v1/api/scenarios` | `scenario-actions` | Create scenario (ad-hoc calculation) |
| GET | `/v1/api/scenarios/{scenarioId}` | `scenario-actions` | Get scenario by ID |
| GET | `/v1/api/interventions/{interventionId}/monitoring-periods/{monitoringPeriodId}/scenarios` | `scenario-period-actions` | List scenarios for a monitoring period |
| POST | `/v1/api/interventions/{interventionId}/monitoring-periods/{monitoringPeriodId}/scenarios` | `scenario-period-actions` | Create scenario for a monitoring period |
| GET | `/v1/api/interventions/{interventionId}/monitoring-periods/{monitoringPeriodId}/scenarios/{scenarioId}` | `scenario-period-actions` | Get scenario by ID (period-scoped) |
| GET/POST/GET | `/v1/api/verifiers/{verifierId}/interventions/{interventionId}/monitoring-periods/{monitoringPeriodId}/scenarios[/{scenarioId}]` | `scenario-period-actions` | Verifier-scoped variants |

## Lambda Functions

| Function | Trigger | Memory | Timeout | Responsibility |
|----------|---------|--------|---------|----------------|
| `mp-events-fn` | EventBridge (domain bus) | 2048 MB | 3 min | Dispatches monitoring period events to SQS; resolves next-eligible period on approval |
| `mp-queue-worker-fn` | SQS FIFO (batchSize=1) | 2048 MB | 10 min | Runs calculation; saves Job + report |
| `scenario-actions-fn` | API Gateway | 2048 MB | 3 min | Ad-hoc scenario CRUD (contact-scoped) |
| `scenario-period-actions-fn` | API Gateway | 2048 MB | 3 min | Ad-hoc scenario CRUD (monitoring period-scoped; admin + verifier) |

## Events Consumed

| Event | Source | Handler |
|-------|--------|---------|
| `monitoring-period-created` | [[Interventions]] | `mp-events-fn` → enqueue |
| `monitoring-period-updated` | [[Interventions]] | `mp-events-fn` → enqueue |
| `monitoring-period-approved` | [[Interventions]] | `mp-events-fn` → resolve next period → enqueue |
| `baseline-approved` | [[Interventions]] | `mp-events-fn` → resolve next period → enqueue |

No events published externally.

## Infrastructure

- **DynamoDB** `quantifications-table` — Job records; PITR enabled
- **S3** `reports-bucket` — calculation reports (JSON)
- **EventBridge** `quantifications-event-bus` — domain-internal event bus
- **SQS FIFO** `mp-queue.fifo` — monitoring period work queue (10-min visibility timeout, maxReceiveCount=3, content-based deduplication)
- **SQS FIFO** `mp-queue-dlq.fifo` — DLQ (14-day retention)
- **SSM** — publishes `quant/api` (API Gateway endpoint)

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | S2S automation token for cross-domain API calls |
| [[Interventions]] | Consumes monitoring period and baseline events; fetches intervention + monitoring period data via Interventions v2 API |
