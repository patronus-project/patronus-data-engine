# Patronus Data Engine: Code Outline and Runtime Flow

## 1) What this repository is

This repository is the ingestion and relay service in a two-service telemetry pipeline.

In simple terms:
- A mobile app sends car telemetry values (from an OBD adapter) to this service over HTTP.
- This service immediately relays those values to connected consumers over WebSocket.
- Another service listens and stores the data in MongoDB.

Think of this repo as the real-time gateway between data producers and data consumers.

## 2) Product context for first-time readers

Even if you know nothing about OBD:
- OBD data is a stream of measurements from a vehicle (speed, RPM, temperatures, fuel-related values, and more).
- The mobile app sends those values as query parameters.
- This service does not perform deep analytics. It mainly receives, wraps, and broadcasts data.

## 3) Folder and file outline

- index.js
Purpose: Starts HTTP server, sets API routes, configures CORS, starts WebSocket server.

- websocketserver.js
Purpose: Hosts WebSocket endpoint and broadcasts messages to all connected clients.

- data.json
Purpose: A static mapping dictionary of telemetry keys to human-readable names.

- package.json
Purpose: Runtime dependencies and start scripts.

## 4) Startup flow

1. Process starts from index.js.
2. Express app and HTTP server are created.
3. Global middleware is attached:
- Body parser
- CORS headers
4. HTTP routes are registered:
- GET /keys
- GET /obd2
- GET /obd2sim
5. WebSocket server is attached to the same HTTP server at path /wsinit.

## 5) HTTP routes and behavior

### GET /keys

Returns the full key mapping from data.json.

Business meaning:
- Lets clients translate short telemetry IDs into readable labels.

### GET /obd2

Input:
- Query-string telemetry values from client app.

Behavior:
- Logs broadcast timestamp.
- Stringifies query payload.
- Broadcasts it to all connected WebSocket clients with author = OBD.
- Returns OK response.

### GET /obd2sim

Input:
- Query-string telemetry values.

Behavior:
- Adds sim = true to payload.
- Broadcasts similarly to /obd2.
- Returns OK response.

Business meaning:
- Simulated records can be sent through same channel but can be filtered downstream.

## 6) WebSocket behavior

WebSocket server:
- Mounted on /wsinit.
- On each new client connection, server broadcasts a membership message.
- On receiving a client message, server attempts JSON parse and logs payload.msg.

Broadcast envelope format:
- type: BROADCAST
- author: Sender category, for example OBD
- payload: JSON string that contains telemetry key-value pairs

## 7) End-to-end message path

~~~mermaid
flowchart LR
  A[Mobile App or Source] -->|HTTP GET /obd2| B[Data Engine API]
  B --> C[Create broadcast envelope]
  C --> D[WebSocket server /wsinit]
  D --> E[All connected subscribers]
  E --> F[Persistence service consumes OBD messages]
~~~

## 8) Sequence view

~~~mermaid
sequenceDiagram
  participant App as Mobile App
  participant API as Data Engine HTTP
  participant WS as Data Engine WebSocket
  participant Sub as Subscriber

  App->>API: GET /obd2?eml=...&session=...&kph=...
  API->>API: Convert query to JSON string
  API->>WS: broadCastMsg(payload, author=OBD)
  WS->>Sub: {type:BROADCAST, author:OBD, payload:"..."}
  API-->>App: 200 OK
~~~

## 9) Data ownership and responsibilities

This service is responsible for:
- Input endpoint availability
- Fan-out to WebSocket clients
- Lightweight transport envelope

This service is not responsible for:
- Data validation quality checks
- Deduplication
- Long-term storage
- Analytics

## 10) Key runtime configuration

- PORT
Default: 80
Purpose: HTTP server port.

## 11) Operational notes

- CORS is wide open to allow cross-origin clients.
- Because payload is sent from query parameters, most values arrive as strings.
- The service is intentionally thin and pushes business persistence logic downstream.

## 12) Quick mental model

If the persistence service is down:
- Data engine still accepts /obd2 requests.
- Broadcasts are attempted to connected clients only.
- No built-in buffering is present in this repo.
