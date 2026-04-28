# Mailer

Provides email delivery for the platform. Other services publish a `SendEmailCommand` event and Mailer handles template resolution, rendering, and dispatch via SES. No HTTP API — purely event-driven.

## Domain Model

```
SendEmailDto
  templateId: string          ← filename stem of HTML template (e.g. "welcome")
  toAddresses: email[]
  ccAddresses?: email[]
  fromAddressOverride?: email ← defaults to configured DEFAULT_FROM_ADDRESS
  replyToAddresses?: email[]
  payload: Record<string, string>  ← values substituted into template

EmailTemplateDto
  templateId: string
  name: string
  description?: string
  subjectTemplate: string
  bodyHtmlTemplate: string
  bodyTextTemplate?: string
  tags?: string[]
```

## Template System

Templates are HTML files bundled as a Lambda Layer and mounted at `/opt/templates`. Template ID maps directly to filename (`welcome` → `welcome.html`).

**Metadata** is declared via `<meta name="mailer:*">` tags in the HTML `<head>`:

| Tag | Required | Purpose |
|-----|----------|---------|
| `mailer:name` | Yes | Human-readable template name |
| `mailer:subject` | Yes | Subject line template |
| `mailer:description` | No | Description |
| `mailer:tags` | No | Comma-separated tags |

**Plaintext body** — optional `<div id="mailer-text">` inside `<body>` is extracted as the plaintext version and stripped from the HTML version.

**Rendering** — `EmailRenderService` processes templates in two passes:
1. Resolve `{{#if variable}}...{{else}}...{{/if}}` conditionals (non-nested)
2. Interpolate `{{variable}}` placeholders from `payload`

## Flow

```
SendEmailCommand → mailer-event-bus
  → EventBridge rule → send-email-queue.fifo (SQS)
  → send-email-fn (SQS trigger)
      EmailTemplateRepository loads template from Lambda Layer
      EmailRenderService renders subject + body
      SesEmailService sends via SES
```

## Lambda Functions

| Function | Trigger | Responsibility |
|----------|---------|----------------|
| `send-email-fn` | SQS (`send-email-queue.fifo`) | Load template, render, send via SES |

## Events

### Consumed (from mailer event bus)
| Event | Handler |
|-------|---------|
| `mailer-send-email` (`SendEmailCommand`) | Routed to SQS by EventBridge rule → `send-email-fn` |

## Infrastructure

- **EventBridge** `mailer-event-bus` — domain-internal event bus
- **SQS FIFO** `send-email-queue.fifo` — buffers delivery requests (30s visibility timeout, 4-day retention, content-based deduplication)
- **SQS FIFO** `send-email-dlq.fifo` — dead-letter queue (1-day retention, maxReceiveCount=1)
- **Lambda Layer** `email-templates-layer` — HTML template files mounted at `/opt/templates`
- **SES** — email delivery (default from address: `"Athian Support" <support@athian.ag>`)
- **CloudWatch alarm** — on DLQ message receive count ≥ 1 → SNS → email notification list

## Cross-service Dependencies

Any platform service can publish `SendEmailCommand` to the mailer event bus to trigger an email. No inbound service dependencies.
