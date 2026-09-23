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
Vercel /r/[slug]?u=<optional serialized unit>
  ↓
Supabase Edge scan-redirect
  ↓
Resolve active QR + routing rules
  ↓
qr.scan + qr.redirect telemetry
  ↓
WhatsApp / URL / landing page
  ↓
webhooks / ingest API
  ↓
conversation → conversion → attributed revenue
```

The public Vercel route forwards Vercel's approximate IP-geolocation headers to the Supabase Edge tracking runtime. Privileged database access remains inside Supabase; no Supabase secret key is required in the Vercel redirect route.

A QR only exists when it exists in the database. There are no demo redirect fallbacks.

## Data principles

- Raw IP addresses are never persisted.
- Network-derived location is approximate and must never be presented as GPS.
- First-party visitor/session IDs are pseudonymous.
- Metrics distinguish **Exact**, **Estimated** and **Derived** signals.
- The initial live MILANGA catalog includes the `milanga-folleto` QR and its WhatsApp destination; analytics starts clean with zero real events until the first production scan.

## Backend

Supabase stores workspaces, campaigns, destinations, QR codes, versions, optional serialized units, events, conversions, experiments, integrations and alerts.

The public redirect logic runs in `supabase/functions/scan-redirect/` and writes tracking events server-side.

Primary migration files live in `supabase/migrations/`.

## APIs

- `GET /r/[slug]` — public Vercel entrypoint for a tracked QR
- `GET /functions/v1/scan-redirect?slug=...` — Supabase Edge tracking + redirect runtime
- `POST /api/ingest` — authenticated event/conversion ingestion
- `POST /api/serialize` — optional bulk serialized QR-unit creation
- `GET|POST /api/webhooks/whatsapp` — WhatsApp Business Platform verification and webhook
- `/api/health/*` — destination health checks

## Environment

Copy `.env.example` and configure the isolated Supabase project plus tracking/integration secrets used by the remaining protected APIs. The public QR redirect path does not need a Supabase secret in Vercel.

## Development

```bash
npm install
npm run lint
npm run build
```
