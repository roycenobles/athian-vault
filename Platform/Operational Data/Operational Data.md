# Operational Data

Stores and retrieves time-series operational measurements from producer organizations. Data is formatted using the **Athian Open Data Model (AODM)** — a versioned schema that normalizes field observations across data sources. This data feeds downstream into quantification calculations within [[Interventions]].

## Core Concepts

**Operational Data (AODM)** — time-series observations keyed by organization, location, data source, and date range. Two schema versions exist (`1.0.0` and `2.x`), validated at write time.

**Operational Data Config** — per-organization registry of external data sources (name, version, identifier, optional location binding).

```
OperationalDataStorage (AODM)
  dataSource: string
  dataSourceVersion: string
  dataSourceIdentifier: string
  aodmVersion: "1.0.0" | "2.x"
  observationStart / observationStop: string
  producerId: string
  producerLocationId?: string

OperationalDataConfig
  organizationId: uuid
  externalDataSources[]:
    dataSourceName: string
    dataSourceVersion: string
    dataSourceIdentifier: string
    locationId?: uuid
    created/updated: string
    createdBy/updatedBy: UserInfo
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/api/organizations/{organizationId}/locations/{locationId}/operational-data` | List data by org, location, and date range |
| PUT | `/v1/api/organizations/{organizationId}/locations/{locationId}/operational-data` | Upsert operational data |
| GET | `/v1/api/organizations/{organizationId}/operational-data-config` | Get data source config for org |
| PUT | `/v1/api/organizations/{organizationId}/operational-data-config` | Replace data source config for org |

## Lambda Functions

The service has a current API-based interface and a legacy direct-invocation interface. Both are active.

### Current (API-backed)
| Function | Responsibility |
|----------|----------------|
| `config-actions` | API handler for operational data config CRUD |
| `data-actions` | API handler for operational data upsert/query |
| `data-migration` | Data migration process |

### Legacy (direct Lambda invocation)
These are invoked by other services via ARN (stored in SSM) rather than through the API.

| Function | SSM Param | Responsibility |
|----------|-----------|----------------|
| `get-data-fn` | `GET_DATA_FUNCTION_ARN` | Query operational data by org + date range |
| `get-config-fn` | `GET_CONFIG_FUNCTION_ARN` | Get config by organization |
| `get-config-ds-fn` | `GET_CONFIG_BY_DS_FUNCTION_ARN` | Get config by data source name + version |
| `upsert-config-fn` | `UPSERT_CONFIG_FUNCTION_ARN` | Upsert data source config |
| `store-data-event-fn` | — | Listens on domain event bus, persists incoming AODM data |
| `config-events-fn` | — | Listens on domain event bus, applies config updates |

[[Interventions]] uses the legacy ARN-based invocation pattern.

## Events

### Consumed (from domain event bus)
| Event | Handler |
|-------|---------|
| `store-athian-open-data-model` | `store-data-event-fn` — persists AODM payload |
| `operational-data-config-updated` | `config-events-fn` — applies config change |

### Published (to default event bus)
| Event | Trigger |
|-------|---------|
| `operational-data-created` | New AODM record stored |
| `operational-data-updated` | Existing AODM record updated |
| `operational-data-deleted` | AODM record removed |
| `athian-open-data-model-available` | Notifies downstream that new data is ready |

## Infrastructure

- **DynamoDB** `config-table` — data source configuration per organization
- **DynamoDB** `periodic-table` — AODM time-series data storage
- **EventBridge** `operational-data-event-bus` — domain-internal bus
- **DataLakeStack** — Glue Zero-ETL integration for both tables → analytics account (when analytics enabled)
- **KMS** — customer-managed key (when analytics enabled)
- **SSM** — publishes `OPERATIONAL_DATA.PARAMS.API` + 4 Lambda ARNs for direct invocation

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | JWT authorization |
| [[Interventions]] | Primary consumer — invokes legacy Lambda ARNs to read/write component operational data |
