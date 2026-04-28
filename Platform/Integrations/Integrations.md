# Integrations

Bridges the platform to external data vendors. Manages the full ingestion pipeline — periodic scheduled pulls, ad-hoc on-demand fetches, and data verification — and routes results into [[Operational Data]] as AODM events. Currently supports **Uplook** (v2.0.0 and v3.0.0) as the only vendor.

## Core Concepts

**Ingestion** — fetching raw vendor data, mapping it to AODM, and publishing `StoreAthianOpenDataModelEvent` to the default event bus so [[Operational Data]] can persist it.

**Ingestion Strategy** — a per-vendor, per-version plugin (`IngestionStrategyFactory`) that knows how to fetch and verify data from a specific external API. Current strategies: `UplookV2IngestionStrategy`, `UplookV3IngestionStrategy`.

**Periodic vs Ad-hoc** — periodic ingestion runs on a cron schedule across all registered orgs; ad-hoc ingestion is triggered per-org on demand. Both ultimately execute the same ingestion pipeline; the `isAdhoc` flag controls whether existing records can be overwritten.

## Ingestion Flows

### Periodic (scheduled)
```
EventBridge cron rule
  → uplook-periodic-ingestion-fn
      queries Operational Data config (legacy Lambda ARN) for all Uplook orgs
      enqueues one SQS message per org/datasource → ingestion-queue.fifo
  → adhoc-ingestion-event-fn (SQS trigger, batch=1, concurrency=5)
      fetches vendor data → maps to AODM → publishes StoreAthianOpenDataModelEvent
```

### Ad-hoc (on-demand)
```
AdhocIngestionTriggerEvent on integrations-event-bus
  → adhoc-ingestion-event-fn (EventBridge subscription)
      same pipeline as above; isAdhoc=true allows overwriting existing records
```

### Monitoring period lock notification
```
Monitoring period Approved/Declined event on integrations-event-bus
  → mp-notify-event-fn
      if Uplook 3.0.0 and non-pilot: POSTs lock-status to Uplook API
```

## Lambda Functions

| Function | Trigger | Responsibility |
|----------|---------|----------------|
| `uplook-periodic-ingestion-fn` | EventBridge cron (configurable schedule) | Reads all Uplook org configs from Operational Data, enqueues ingestion tasks to SQS FIFO queue |
| `adhoc-ingestion-event-fn` | EventBridge (domain bus) + SQS | Executes ingestion pipeline: fetch → map to AODM → publish `StoreAthianOpenDataModelEvent` |
| `get-adhoc-verify-fn` | Direct Lambda invocation (ARN in SSM) | Verifies a data source identifier is valid without ingesting data; returns `{ isVerified, message }` |
| `mp-notify-event-fn` | EventBridge (domain bus) | On MP Approved/Declined: sends lock-status notification to Uplook API (v3.0.0 only) |
| `load-sample-data-events-fn` | EventBridge (domain bus) | Generates synthetic Uplook sample data and publishes as AODM events (dev/test use) |

## Events

### Consumed (from integrations event bus)
| Event | Handler |
|-------|---------|
| `integrations-app-periodic-ingestion-trigger` | `uplook-periodic-ingestion-fn` |
| `integration-app-adhoc-ingestion-trigger` | `adhoc-ingestion-event-fn` |
| Monitoring period lifecycle events | `mp-notify-event-fn` |
| `load-sample-data` | `load-sample-data-events-fn` |

### Published (to default event bus)
| Event | Trigger |
|-------|---------|
| `store-athian-open-data-model` | Ingestion complete — consumed by [[Operational Data]] to persist AODM records |

## Infrastructure

- **EventBridge** `integrations-event-bus` — domain-internal event bus
- **SQS FIFO** `ingestion-queue.fifo` — decouples periodic scheduling from per-org ingestion execution (15-min visibility timeout, 4-day retention, deduplication per message group)
- **Secrets Manager** `uplook-client-secret-holder` — Uplook OAuth client secret (manually overwritten per env)
- **Secrets Manager** `uplook-access-token-holder` — Uplook access token, rotated at runtime
- **CloudWatch alarms** — on `adhoc-ingestion-event-fn`, `uplook-periodic-ingestion-fn`, and `load-sample-data-events-fn` errors → SNS email to distribution list
- **SSM** — publishes `UPLOOK_BASE_URI`, `UPLOOK_CLIENT_SECRET_ARN`, `UPLOOK_SECRET_TOKEN_ARN`, `GET_ADHOC_VERIFY_FUNCTION_ARN`, `INGESTION_QUEUE_ARN`

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | S2S token for authenticated calls to [[Operational Data]] |
| [[Operational Data]] | Reads org config via legacy `get-config-by-ds-fn` ARN; publishes ingested data as `StoreAthianOpenDataModelEvent` |
| [[Interventions]] | Monitoring period lifecycle events consumed by `mp-notify-event-fn` |
