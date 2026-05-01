# Asset Accounting

Handles the financial side of sustainability asset claims. When a claim is created, Asset Accounting derives producer payment records (one per producer per intervention) and generates a billing report CSV emailed to the accounting distribution list. No HTTP API — purely event-driven.

![[Platform/Asset Accounting/_draw.io/overview.drawio.png]]
## Flow

```
ClaimCreated (Asset Management)
  → on-claim-created-events-fn
      fetches producer names from Organizations API
      fetches asset bundles from Asset Management API
      groups by producer + intervention
      creates one ProducerPayment per group → producer-payments-table
      publishes ClaimProducerPaymentsCreated

ClaimProducerPaymentsCreated (domain-internal)
  → on-producer-payment-created-fn
      generates BillingReport CSV
      writes CSV → producer-payment-documents S3 bucket
      sends email with CSV attachment → accounting distribution list
      updates payment status to Reported
      publishes ProducerPaymentCreated per payment
```

## Domain Model

```
ProducerPaymentDto
  id: uuid
  producerId / producerName: string
  buyerId / buyerName: string
  claimId / claimCode: string
  invoiceNumber: string
  assets: number
  paymentPerUnit / paymentTotal: number
  protocolId / protocolName / protocolVintage
  interventionId / interventionCode: string
  monitoringPeriodCodes: string[]
  objectKey?: string          ← S3 path of billing report
  status: ProducerPaymentStatus   ← Pending | Reported | Resolved
  statusUpdated: string

BillingReportDto
  objectKey: string           ← S3 key
  claimCode: string
  items: BillingReportItemDto[]

BillingReportItemDto
  vendorName / invoiceNumber / invoiceDate / dueDate: string
  billLineItemAmount: number
  billLineItemAccountName / billLineItemAccountNumber?: string
  billLineItemDescription?: string
  billLineItemOrder: number
```

## Lambda Functions

| Function | Event | Responsibility |
|----------|-------|----------------|
| `on-claim-created-events-fn` | `ClaimCreated` | Creates producer payment records per producer/intervention; publishes `ClaimProducerPaymentsCreated` |
| `on-producer-payment-created-fn` | `ClaimProducerPaymentsCreated` | Generates billing report CSV, writes to S3, emails accounting list, marks payments as Reported |

## Events

### Published (to default event bus)

| Event | Trigger |
|-------|---------|
| `claim-producer-payments-created` | All payments for a claim have been created |
| `producer-payment-created` | Individual payment record created |
| `producer-payment-status-updated` | Payment status changes (Pending → Reported → Resolved) |

### Consumed

| Event | Source | Handler |
|-------|--------|---------|
| `claim-created` | [[Asset Management]] | `on-claim-created-events-fn` — creates payments |
| `claim-producer-payments-created` | Asset Accounting (self) | `on-producer-payment-created-fn` — billing report + email |

## Infrastructure

- **DynamoDB** `producer-payments-table` — payment records; KMS key + Glue Zero-ETL when analytics enabled
- **S3** `producer-payment-documents` — billing report CSVs (read/write; delete disabled)
- **EventBridge** `asset-accounting-event-bus` — domain-internal event bus
- **SES** — billing report email with CSV attachment; from `support@athian.ag` (stage-prefixed in non-prod)
- **CloudWatch alarms** — on errors in both event functions → SNS → email distribution list

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | S2S integration token for cross-domain API calls |
| [[Asset Management]] | Consumes `ClaimCreated`; fetches asset bundle details via API |
| [[Organizations]] | Fetches producer organization names via API |
