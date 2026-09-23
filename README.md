# ScanFlow

**Physical Attribution Intelligence.** ScanFlow turns printed QR touchpoints into measurable acquisition channels: scan → redirect → conversation → order → attributed revenue.

## Product modules

- **Command Center** — funnel, live activity, physical channels, heatmaps and health
- **QR Inventory** — permanent endpoints, versions and safety scores
- **QR Studio** — branded modules/eyes/colors, CTA frames, print sizing and SVG export
- **Campaigns** — group assets, QR, objectives and outcomes
- **Distribution** — print batches, geography, quantities, cost, response and physical ROAS
- **Analytics** — time, approximate geography, device and repeat behavior
- **Conversions** — scan-to-business-outcome attribution
- **Experiments** — deterministic A/B routing
- **Live** — event stream and real-time signal view
- **Integrations** — Supabase, WhatsApp Business Platform, Vercel and webhooks

## Tracking architecture

```text
Printed QR
  ↓
/r/[slug]?u=<optional serialized physical unit>
  ↓
permanent QR identity + current version
  ↓
smart routing / A-B allocation
  ↓
qr.scan + qr.redirect telemetry
  ↓
WhatsApp / URL / landing
  ↓
webhooks / ingest API
  ↓
conversation → order → revenue
```

The printed QR remains valid while its destination can be versioned or changed in ScanFlow.

## Privacy

ScanFlow intentionally does **not** persist raw IP addresses. Approximate deduplication uses a daily HMAC created in memory and first-party pseudonymous visitor/session IDs. Vercel network geolocation is treated as approximate, never as GPS.

## Backend

The Supabase schema is defined in:

`supabase/migrations/20260923193000_scanflow_core.sql`

It includes multi-workspace RLS, campaigns, destinations, QR/version history, distribution batches, serialized units, experiments, append-only events, conversions, integrations and alerts.

## APIs

- `GET /r/[slug]` — tracked redirect
- `POST /api/ingest` — authenticated event/conversion ingestion
- `GET|POST /api/webhooks/whatsapp` — WhatsApp Business Platform verification + webhook

## Environment

Copy `.env.example`. The new isolated Supabase project can be connected later without changing the application architecture.

## Development

```bash
npm install
npm run dev
npm run build
```

See `docs/ARCHITECTURE.md` for event confidence, privacy, serialization, routing and WhatsApp attribution details.
