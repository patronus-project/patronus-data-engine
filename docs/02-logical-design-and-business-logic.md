# Patronus Data Engine: Logical Design and Business Logic

## 1) Design intent

This service is designed as a transport boundary between telemetry producers and downstream processors.

Primary objective:
- Accept incoming event data quickly.
- Relay events in near real-time.
- Keep business rules minimal in this layer.

## 2) Bounded context

This repository belongs to the Ingestion and Distribution context.

Inside boundary:
- HTTP ingress handling
- Message envelope creation
- WebSocket broadcast

Outside boundary:
- Data persistence strategy
- Aggregation or archival
- Quality scoring or anomaly detection

## 3) Core domain concepts

- Telemetry Event
A key-value set of values from a moving vehicle at a point in time.

- Event Source
A producer that submits telemetry values through /obd2 endpoints.

- Broadcast Envelope
A transport wrapper carrying metadata:
- type
- author
- payload

- Subscriber
A consumer connected over WebSocket that receives broadcasted events.

## 4) Business logic rules implemented here

Rule 1: Broadcast every /obd2 request
- Any request to /obd2 is transformed and broadcast as author OBD.

Rule 2: Allow simulated traffic
- /obd2sim marks events with sim true before broadcasting.

Rule 3: Provide key dictionary
- /keys exposes device-id mapping for telemetry interpretation.

Rule 4: Keep this layer stateless
- No local buffering, no local database writes, no in-memory event history.

## 5) Architecture diagram

~~~mermaid
graph TD
  subgraph Producer Side
    A[Mobile App with OBD source]
  end

  subgraph Data Engine
    B[HTTP Ingress]
    C[Route Handling]
    D[Envelope Builder]
    E[WebSocket Broadcast Hub]
  end

  subgraph Consumer Side
    F[Persistence Service]
    G[Other listeners]
  end

  A --> B
  B --> C
  C --> D
  D --> E
  E --> F
  E --> G
~~~

## 6) Decision table

| Input path | Additional mutation | Envelope author | Expected downstream behavior |
|---|---|---|---|
| /obd2 | None | OBD | Persist as real telemetry |
| /obd2sim | Add sim=true | OBD | Usually ignored for storage |
| /keys | None | Not applicable | Return static dictionary |

## 7) Reliability model

Current model is at-most-once relay from this service perspective:
- No retry queue in this service.
- No replay endpoint.
- Delivery depends on active subscriber connectivity at broadcast time.

## 8) Security and trust assumptions

- CORS allows all origins.
- No route authentication in current code path.
- Payload validity is mostly trusted and delegated downstream.

## 9) Scaling model

Horizontal scaling considerations:
- Stateless HTTP layer can scale.
- WebSocket fan-out typically needs sticky sessions or pub-sub backplane in multi-instance setups.

## 10) Why this design likely made sense

For early product stages this design favors:
- Simplicity
- Fast setup
- Fast end-to-end feedback from live vehicle data to persistence

Tradeoff accepted:
- Lower delivery guarantees in exchange for reduced complexity.

## 11) Extension points

Natural future extensions without changing repository purpose:
- Add request auth and source identity checks.
- Add lightweight schema validation.
- Add health endpoint and basic delivery metrics.
- Add buffering/pub-sub broker for stronger delivery guarantees.
