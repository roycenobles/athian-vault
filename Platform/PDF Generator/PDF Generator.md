# PDF Generator

Renders HTML templates into PDF, plain-text, or DOCX outputs and routes the result to either email (SES) or S3. No HTTP API — two invocation paths: EventBridge → SQS → async generation, and direct Lambda invocation for synchronous check-or-enqueue.

## Flow

```
EventBridge (source: athian.pdf-generation.enqueue)
  → GeneratePdfEvent → pdf-generator-event-bus
  → EventBridge rule (passes $.detail.data)
  → pdf-generator-queue.fifo (SQS)
  → gen-pdf-fn
      renders HTML template
      converts HTML → PDF (Chromium + QPDF encryption)
      routes to email (SES) or S3

Direct Lambda invocation → gen-or-ret-fn
  if document exists in S3 at storagePath → returns presigned URL (COMPLETE)
  if not found → enqueues to pdf-generator-queue.fifo → returns (ACCEPTED)
```

## Request Schema

```
GeneratePdfRequestDto
  templateType: TemplateType      ← "Claim Summary" | "Verification Report" | "Test Template"
  attachmentType: ReportType      ← "pdf" | "txt" | "docx"
  destinationType?: DestinationType   ← "email" (default) | "s3"
  destinationOverride?: email     ← override recipient email
  templateData: Record<string, any>   ← values interpolated into the HTML template
  storagePath?: string            ← S3 key for storage or retrieval
  idempotentKey?: string          ← deduplication key (required for gen-or-ret-fn)
  overwrite?: boolean             ← delete existing before regenerating (default false)
  attachmentName?: string         ← custom output filename

gen-or-ret-fn response
  status: "COMPLETE" | "ACCEPTED" | "ERRORED"
  url?: string                    ← presigned S3 URL when COMPLETE
  messageId?: string              ← SQS message ID when ACCEPTED
```

## Lambda Functions

| Function | Trigger | Runtime | Memory | Timeout | Responsibility |
|----------|---------|---------|--------|---------|----------------|
| `gen-pdf-fn` | SQS (batchSize=1, maxConcurrency=2) | Node.js 22 x86_64 | 3008 MB | 60s | Render template → PDF/text → email or S3 |
| `gen-or-ret-fn` | Direct Lambda invocation (ARN) | Node.js 22 ARM64 | 3008 MB | 60s | Check S3 for existing doc; enqueue if absent |

### gen-pdf-fn rendering pipeline

1. Render HTML template from the `template-assets` Lambda Layer using `templateData`
2. For non-PDF output (`txt`, `docx`): strip HTML tags if needed, route to email or S3
3. For PDF: render HTML → PDF via Chromium (`@sparticuz/chromium` + `puppeteer-core`, bundled as native node_modules)
4. Encrypt PDF with AES-256 using the `qpdf-layer` Lambda Layer
5. Route to destination: SES email with attachment, or S3 `PUT` to `storagePath`

## Infrastructure

- **S3** `generated-docs` — rendered documents (read/write; delete not enabled on bucket policy)
- **SQS FIFO** `pdf-generator-queue.fifo` — generation requests (60s visibility timeout, 4-day retention, content-based deduplication)
- **SQS FIFO** `pdf-generator-dlq.fifo` — dead-letter queue (1-day retention, maxReceiveCount=1)
- **EventBridge** `pdf-generator-event-bus` — receives `GeneratePdfEvent` (source: `athian.pdf-generation.enqueue`)
- **EventBridge rule** — routes `GeneratePdfEvent` detail data to SQS FIFO
- **Lambda Layer** `template-assets` — HTML templates + banner images
- **Lambda Layer** `qpdf-layer` — QPDF binary for AES-256 PDF encryption
- **SES** — email delivery with PDF/text attachment
- **CloudWatch alarm** — on DLQ message count ≥ 1 → SNS → email notification list
- **SSM** — publishes:
  - `pdf-generator-s3-bucket-name` — S3 bucket name
  - `pdf-generator-queue-arn` — SQS FIFO queue ARN
  - `pdf-generate-or-retrieve-arn` — Lambda ARN for `gen-or-ret-fn`

## Cross-service Dependencies

No inbound service dependencies. Any platform service can invoke PDF Generator by publishing a `GeneratePdfEvent` to the event bus or invoking `gen-or-ret-fn` directly via Lambda ARN.
