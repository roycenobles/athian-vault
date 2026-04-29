# Web App

The platform's primary user interface. A Next.js application running on ECS Fargate that serves three distinct personas: producers, verifiers (VVBs), and admins. Uses a backend-for-frontend (BFF) pattern — Next.js API routes handle all backend communication server-side using a S2S token; the browser never calls platform services directly.

## Personas & Routes

| Persona | URL prefix | Scope |
|---------|-----------|-------|
| **Producer** | `/producer/[...id]` | Manage interventions, monitoring periods, baselines, components, documents, operational data |
| **Verifier (VVB)** | `/verifier/[...id]` | Review interventions, raise issues, approve/decline monitoring periods and baselines |
| **Admin** | `/admin/...` | Manage organizations, interventions, quantification tools, power tools |

**Auth routes**: `/signin`, `/signout`, `/redirect`, `/select-organizations`

## Architecture

```
Browser (Cognito JWT auth)
  ↕ HTTPS/WSS
ALB → ECS Fargate (Next.js, port 4200)
  Next.js API routes (BFF layer, S2S token)
    → Identities (PDP)
    → Interventions API
    → Organizations API
    → Documents API
    → Operational Data (Lambda ARNs)
    → Asset Management (API + Lambda ARNs)
    → PDF Generator (Lambda ARN + S3)
    → Integrations (Lambda ARN)
    → App Management (feature flags)
    → Protocols API
  Next.js server → Notifications WebSocket
```

## BFF API Routes

Next.js App Router API routes under `/api/` proxy to backend services. Three route namespaces mirror the persona hierarchy:

| Namespace | Example routes |
|-----------|---------------|
| `/api/producer/[producerId]/...` | Interventions, monitoring periods, baselines, components, documents, emissions, herd data, reduction estimates |
| `/api/verifier/[verifierId]/...` | Interventions, monitoring periods, baselines, components, issues, documents, verification reports |
| `/api/admin/...` | Interventions (search, manage), organizations (search, contacts, locations), power tools, scenarios, users |
| `/api/common/...` | Feature flags, event publishing |

## Infrastructure

- **ECS Fargate** — Next.js container on port 4200 (dev: 256 CPU/512 MB; prod: 2048 CPU/4096 MB; 2 tasks min)
- **Application Load Balancer** — internet-facing HTTPS at `https://app.{stage}.{domain}`
- **VPC** — dedicated, 2 AZs, public subnets for ALB
- **X-Ray sidecar** — distributed tracing daemon co-deployed in task
- **SSM** — runtime log level at `/{stage}/app/WEB-APP-LOG-LEVEL`

## Build & Deploy

At CDK deploy time, `buildWebClient()` runs `nx build web-app`, installs production dependencies into the dist output, then Docker packages the result. The Next.js `start` command serves from the compiled `.next` directory on port 4200.

`NEXT_PUBLIC_*` vars are baked in at build time; server-side vars are injected as ECS task environment variables.

## Cross-service Dependencies

| Service              | Usage                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| [[Identities]]       | Cognito-hosted auth (login/logout/redirect); PDP endpoint for request authorization         |
| [[Interventions]]    | Core intervention, monitoring period, baseline, component, issue workflows                  |
| [[Organizations]]    | Org and location data; supply shed; contracts                                               |
| [[Documents]]        | File upload/download/management for monitoring periods and baselines                        |
| [[Operational Data]] | Reads/writes operational data config and AODM data via legacy Lambda ARNs                   |
| [[Notifications]]    | WebSocket endpoint for real-time job progress during async operations (bulk download, etc.) |
| [[App Management]]   | Feature flags (`showNewComponentExperience`, `showAlertBanner`, `showNewCsv`)               |
| [[Integrations]]     | Adhoc Uplook verification (Lambda ARN); Uplook token management                             |
| [[PDF Generator]]    | PDF generation and retrieval (Lambda ARN + S3 bucket)                                       |
| [[Asset Management]] | Asset bundles, supply shed available assets, claims (Lambda ARNs + API)                     |
| Protocols            | Protocol definitions and availability                                                       |
| [[Mailer]]           | Email sending via admin power tools                                                         |
