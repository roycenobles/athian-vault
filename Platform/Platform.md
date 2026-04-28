# Athian Sustainability Platform
The Athian Sustainability Platform is built on a cloud-native microservices architecture in AWS, enabling modular, scalable, and independently deployable services aligned with discrete sustainability domains—such as asset management, emissions accounting, and insetting project management.

![[overview.drawio.png|600]]
# Microservices
Each microservice encapsulates its own bounded context and owns its data model, adhering to Domain-Driven Design (DDD) principles. Services are exposed via a unified API layer, providing secure, performant access for internal and external consumers.
## [[App Management]]
Feature flag management. Flags are stored in Lambda environment variables and served via a single Lambda API; the web app polls on page load to gate UI features per stage.

## [[Asset Management]]
Lifecycle management for sustainability assets (AVSA and NAVSA). Creates asset bundles when monitoring periods are approved, maintains supply shed availability projections for downstream buyers, and handles claim creation with co-claiming support.

## [[Asset Accounting]]
Financial accounting for asset claims. When a claim is created, derives producer payment records (one per producer per intervention), generates a billing report CSV, and emails it to the accounting distribution list via SES.

## [[Control Plane]]
Pure infrastructure CDK — no runtime services. Provisions IAM groups and a self-service credential policy for internal teams, and links each stage account to a central monitoring account via AWS OAM for cross-account CloudWatch/X-Ray observability.

## [[Documents]]
File storage and management for monitoring periods and baselines. Handles upload/download via S3 presigned URLs and emits a `DownloadReadyEvent` when bulk archive jobs complete.

## [[Identities]]
Authentication and authorization backbone. Manages Cognito user pools, S2S integration tokens, and OPA/WASM-based policy evaluation (PEP/PDP pattern) used by every other service to authorize requests.

## [[Integrations]]
ETL bridge to the external Uplook verification platform. Ingests producer operational data on a periodic schedule and on-demand, and notifies Uplook when a monitoring period is locked (approved or declined).

## [[Interventions]]
Core domain service for the producer workflow. Manages interventions, monitoring periods, baselines, components, issues, and verification reports across producer, verifier, and admin personas.

## [[Mailer]]
Fire-and-forget email delivery. Any service publishes a `SendEmailCommand` event; Mailer resolves the HTML template, renders it with `{{variable}}` interpolation, and sends via SES.

## [[Notifications]]
Real-time WebSocket delivery via a Socket.IO server on ECS Fargate with Redis pub/sub. A Lambda bridge receives platform events from EventBridge and forwards them into the Socket.IO room system for connected browser clients.

## [[Operational Data]]
Stores and serves Athian Open Data Model (AODM) data — versioned operational data configuration and time-series measurements for interventions. Exposes both an HTTP API and legacy Lambda ARN interfaces; feeds the quantification pipeline.

## [[Organizations]]
Supply chain graph management. Maintains organizations, locations, inter-org connections, contracts, and derives the supply shed (full upstream/downstream connection tree) used for emissions allocation and asset availability.

## [[PDF Generator]]
On-demand document generation. Renders HTML templates (Claim Summary, Verification Report) into encrypted PDFs via Chromium and QPDF, routing output to email or S3. Supports synchronous check-or-enqueue via direct Lambda invocation.

## [[Quantifications]]
Protocol-specific GHG emissions calculator. Runs the AMMP (Anaerobic Manure Management Protocol) against monitoring period data to produce quantified net-change results, with idempotency checks and ad-hoc scenario support via API.

## [[Web App]]
Primary user interface — a Next.js app on ECS Fargate serving producer, verifier, and admin personas. Uses a backend-for-frontend (BFF) pattern: all backend calls are proxied server-side using a S2S token; the browser never calls platform services directly.
