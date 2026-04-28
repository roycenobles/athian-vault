# Notifications

Delivers real-time WebSocket notifications to browser clients. The server is a Socket.IO process running on ECS Fargate (not Lambda), with a Redis-backed pub/sub adapter to broadcast across multiple instances. A Lambda bridge (`emitter-events`) receives platform events and forwards them into the Socket.IO room system.

## Architecture

```
Platform event bus
  → notifications-event-bus (EventBridge)
  → emitter-events Lambda
      connects to Socket.IO server as S2S client
      emits announce-room to the jobId channel
  → Fargate Socket.IO server (ALB → ECS → Redis pub/sub)
      broadcasts to all browser clients subscribed to that room
```

**Browser clients** connect over HTTPS/WSS to `https://notifications.{stage}.{domain}`, authenticate with a Cognito JWT, and join a room (by `jobId`) to receive updates.

## Domain Model

```
JobProgressDto
  organizationId: uuid
  userId: uuid
  userEmail: email
  jobId: string      ← room identifier; client-managed
  subject: string    ← max 40 chars
  body: string       ← max 600 chars
  progress: number   ← 0–100
```

## Lambda Functions

| Function | Trigger | Responsibility |
|----------|---------|----------------|
| `emitter-events` | EventBridge (notifications domain bus) | Receives `JobProgressEvent` and `DownloadReadyEvent`; connects to Socket.IO server and emits to the relevant room |

## Fargate Service

| Component | Detail |
|-----------|--------|
| Runtime | Node.js Socket.IO server (`socket.io` + `@socket.io/redis-adapter`) |
| Port | 8080 (HTTP inside VPC); 443 externally via ALB |
| Auth | Cognito JWT verified on connect via `socket.io` middleware |
| Scaling | Dev: 1 task; Prod: 2–10 tasks (CPU/memory target 75%) |
| Health check | `GET /health` → 200 |

**Socket.IO events (server-side)**

| Event | Direction | Description |
|-------|-----------|-------------|
| `join-room` | Client → Server | Subscribe to a room by `jobId` |
| `announce-room` | Server → Room | Broadcast a message to all clients in a room |
| `room-message` | Client → Room | Peer message within a room |
| `announce` | Client → All | Broadcast to all connected clients |
| `disconnect` | Client | Client disconnects |

## Events

### Consumed (from notifications event bus)
| Event | Handler |
|-------|---------|
| `job-progress` | `emitter-events` → emits job progress to client room |
| `download-ready` | `emitter-events` → emits download-ready signal to client room |

## Infrastructure

- **ECS Fargate** `socket-service` — Socket.IO server; 2 tasks min in prod, 1 in dev
- **Application Load Balancer** — internet-facing, HTTPS (port 443); idle timeout 3600s (required for long-lived WebSockets); HTTP/2 disabled
- **ElastiCache Redis** (replication group) — pub/sub adapter; allows all Fargate tasks to share the same Socket.IO room state
- **VPC** — dedicated VPC with private subnets for ECS tasks and Redis; ALB in public subnets
- **ACM** certificate + **Route53** A record — `notifications.{stage}.{domain}`
- **EventBridge** `notifications-event-bus` — domain-internal event bus
- **CloudWatch alarm** — on `emitter-events` Lambda errors → SNS → email distribution list
- **SSM** — publishes `NOTIFICATIONS.PARAMS.WEBSOCKETAPI` (server URL) and `NOTIFICATIONS.PARAMS.WEBSOCKETLOGLEVEL` (runtime-configurable log level)

## Cross-service Dependencies

| Service | Usage |
|---------|-------|
| [[Identities]] | Cognito JWT verification for WebSocket connections; S2S integration token for Lambda → Socket.IO auth |
| [[Documents]] | Publishes `DownloadReadyEvent` consumed by `emitter-events` |
| [[Interventions]] | Publishes `JobProgressEvent` consumed by `emitter-events` |
