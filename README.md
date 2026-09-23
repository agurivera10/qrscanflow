# ScanFlow

**QR Analytics & Attribution.** ScanFlow measures physical and virtual QR codes from scan to conversion and attributed revenue.

ScanFlow is intentionally **not** a design platform. It does not manage flyer design, print artwork, templates or creative production. Its job is to answer what happened after a QR was distributed.

## Core product

- **Overview** — qualified scans, visitors, conversions and attributed value
- **QRs** — inventory of tracked QR codes and their status
- **Campaigns** — optional grouping for related QR actions
- **Analytics** — time, approximate geography, device and repeat behavior
- **Live** — raw event stream
- **Conversions** — conversations, orders and revenue linked back to QR activity
- **Settings** — workspace, integrations, privacy and data quality

## Tracking flow

```text
Physical or virtual QR
  ↓
/r/[slug]?u=<optional serialized unit>
  ↓
ScanFlow resolves the active destination
  ↓
qr.scan + qr.redirect telemetry
  ↓
WhatsApp / URL / landing page
  ↓
webhooks / ingest API
  ↓
conversation → conversion → attributed revenue
```

A QR only exists when it exists in the database. There are no demo redirect fallbacks.

## Data principles

- Raw IP addresses are never persisted.
- Network-derived location is approximate and must never be presented as GPS.
- First-party visitor/session IDs are pseudonymous.
- Metrics distinguish **Exact**, **Estimated** and **Derived** signals.
- The initial MILANGA workspace starts with zero QRs, zero campaigns and zero events.

## Backend

Supabase stores workspaces, campaigns, destinations, QR codes, versions, optional serialized units, events, conversions, experiments, integrations and alerts.

Primary migration files live in `supabase/migrations/`.

## APIs

- `GET /r/[slug]` — tracked redirect for a real QR stored in Supabase
- `POST /api/ingest` — authenticated event/conversion ingestion
- `POST /api/serialize` — optional bulk serialized QR-unit creation
- `GET|POST /api/webhooks/whatsapp` — WhatsApp Business Platform verification and webhook
- `/api/health/*` — destination health checks

## Environment

Copy `.env.example` and configure the isolated Supabase project plus tracking/integration secrets.

## Development

```bash
npm install
npm run lint
npm run build
```
