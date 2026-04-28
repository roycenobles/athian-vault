# Documents

Manages file storage and retrieval for intervention-related documents (monitoring periods and baselines). Also handles an asynchronous bulk-download workflow that compresses selected files into a ZIP and delivers a presigned download link via email.

## Domain Model

```
Document
  fileName: string
  fileSize: number
  mimeType: SupportedMimeTypes
  fullPath: string        ← S3 key
  virtualPath: string     ← logical display path
  basePath: string
  isPlaceholder: boolean  ← registered but not yet uploaded
  eTag?: string
  fileDescription?: string
  monitoringPeriodId?: string
  baselineId?: string
  accessControl?: string[]
  createdBy: { userId, firstName, lastName, email }
```

**Supported MIME types**: PNG, JPG, JPEG, HEIC, TXT, CSV, PDF, Word (.doc/.docx), Excel (.xls/.xlsx)

**Document context** — documents always belong to either a `MONITORING_PERIOD` or `BASELINE`.

## API

All routes require JWT authorization. Two parallel route hierarchies exist — one for Producers, one for Verifiers (VVBs):

**Producer routes** — prefix: `/producers/{producerId}/producer-locations/{producerLocationId}/interventions/{interventionId}`

**Verifier routes** — prefix: `/vvb-orgs/{vvbOrgId}` (with optional `/interventions/{interventionId}` segment)

| Method | Path suffix | Description |
|--------|-------------|-------------|
| POST | `.../monitoring-periods/{monitoringPeriodId}/documents` | Upload document(s) |
| GET | `.../monitoring-periods/{monitoringPeriodId}/documents` | List documents |
| GET | `.../monitoring-periods/{monitoringPeriodId}/documents/{documentId}` | Get document + presigned URL |
| PATCH | `.../monitoring-periods/{monitoringPeriodId}/documents/{documentId}` | Update document metadata |
| DELETE | `.../monitoring-periods/{monitoringPeriodId}/documents/{documentId}` | Delete document |

Same set repeated for `.../baselines/{baselineId}/documents[/{documentId}]`.

## Bulk Download Workflow

Asynchronous — triggered by event, progress reported in real time via [[Notifications]].

```
1. Client triggers download → DownloadEvent published to domain event bus
2. DownloadEventsFunction:
     - Resolves document IDs → S3 keys
     - Streams files from document bucket, compresses to ZIP (level 6)
     - Uploads ZIP to downloads bucket (multipart)
     - Publishes JobProgressEvent at each step → Notifications WebSocket
     - Publishes DownloadReadyEvent on completion
3. DownloadReadyEventsFunction:
     - Sends email via SES with presigned URL (expires in 1 hour)
```

ZIP key format: `{interventionCode}-{monitoringPeriodCode|baselineId}-files.zip`  
Stored at: `downloads/{jobId}/{zipKey}` in the downloads bucket.

## Storage

| Resource | Type | Purpose |
|----------|------|---------|
| `document-bucket` | S3 (versioned) | Primary document storage |
| `document-dl-bucket` | S3 | Temporary ZIP download output |
| `document-table` | DynamoDB | Document metadata |
| `document-audit-table` | DynamoDB | Audit trail of document changes |

When analytics is enabled, both DynamoDB tables use customer-managed KMS keys with Glue Zero-ETL access policies.

## Infrastructure

- **API**: HTTP API Gateway with PEP authorizer → [[Identities]] PDP
- **DocumentActionsFunction**: Handles all CRUD API routes
- **DownloadEventsFunction**: Bulk download processor, listens on domain event bus
- **DownloadReadyEventsFunction**: Email delivery via SES on download completion
- **DocumentsAlarmStack**: CloudWatch alarms on download Lambda errors → SNS → email distribution list
- **SSM**: Publishes API endpoint as `DOCUMENTS.PARAMS.DOCUMENTSAPI`

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | JWT authorization + integration token for service-to-service calls |
| [[Interventions]] | Fetches intervention/baseline/monitoring period details for document context validation |
| [[Notifications]] | WebSocket API endpoint for real-time job progress events during bulk download |
