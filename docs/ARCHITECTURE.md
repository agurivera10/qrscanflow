# ScanFlow architecture

ScanFlow treats every printed QR as a permanent physical endpoint and every interaction as an event. The QR is not the analytics system; `/r/[slug]` is.

## Core flow

```text
printed QR
  ↓
/r/[slug]?u=<optional serialized unit token>
  ↓
resolve current QR version
  ↓
apply routing rules / experiment split
  ↓
write qr.scan + qr.redirect
  ↓
302 destination (WhatsApp / URL / landing)
```

The printed code never needs to change when a campaign destination changes. A new `qr_versions` row is published and `qr_codes.current_version_id` is moved forward.

## Data confidence

ScanFlow must never present estimated signals as exact facts.

**Exact events**
- request reached ScanFlow
- timestamp at the redirect runtime
- QR / version / campaign / distribution identifiers encoded or resolved by ScanFlow
- selected routing rule
- destination selected
- webhook events received from an authenticated integration
- order/revenue events sent to the authenticated ingest API

**Estimated signals**
- unique visitor counts based on first-party pseudonymous IDs
- deduplication when cookies are unavailable
- city / region / lat / lon derived from Vercel network headers
- device, OS and browser parsed from user agent

GPS-level location is never collected unless a future explicit-consent experience asks the user for browser geolocation permission.

## Privacy model

- Raw visitor IP must not be persisted.
- `request_hash` is a daily rotating HMAC of ephemeral request signals for approximate deduplication.
- The raw IP is discarded immediately after hashing.
- `sf_vid` is a first-party HTTP-only pseudonymous visitor ID.
- `sf_sid` is a 30-minute first-party session ID.
- Dashboard tables use workspace-scoped RLS.
- Public redirect ingestion uses a server-only Supabase secret; no anon insert policy exists for telemetry.

## Main entities

- `workspaces`: tenant boundary.
- `campaigns`: marketing objective and date/budget grouping.
- `destinations`: WhatsApp, URL, landing or other destinations.
- `qr_codes`: permanent public endpoint (`slug`).
- `qr_versions`: immutable destination + visual + routing snapshot.
- `distribution_batches`: print/distribution lot, zone, quantity and costs.
- `distribution_units`: optional serialized physical pieces with unique tokens.
- `experiments` / `experiment_variants`: deterministic A/B routing.
- `events`: append-only telemetry stream.
- `conversions`: conversations, orders, revenue and other business outcomes.
- `integrations`: provider configuration metadata.
- `alerts`: QR/destination/traffic health signals.

## Serialized physical media

For shared QR mode every physical piece uses the same URL:

```text
/r/milanga-folleto
```

For serialized mode each piece can additionally carry a unit token:

```text
/r/milanga-folleto?u=4FQ9K2
/r/milanga-folleto?u=8M1D7P
```

This allows ScanFlow to attribute scans to individual physical units while keeping the same campaign/QR identity.

## Smart routing

`qr_versions.routing_rules` is a JSON array evaluated server-side. Rules can target:
- country / region / city
- device family
- local hour window
- deterministic traffic percentage

A visitor is assigned consistently for a given rule using a stable hash, making A/B allocation deterministic without a third-party experimentation platform.

## WhatsApp attribution

The Meta webhook endpoint is available at:

```text
/api/webhooks/whatsapp
```

It supports webhook verification, optional request-signature verification, incoming message events, and outbound message status events.

Important: a plain `wa.me` scan and a later inbound WhatsApp message do not automatically share a universal Meta click ID. Exact scan → message attribution therefore needs an attribution reference carried into the conversation (for example a short `[SF:token]` marker in the prefilled message) or another explicit linking mechanism. ScanFlow should label unlinked WhatsApp attribution as estimated/aggregate rather than fabricate a 1:1 join.

## External business events

Authenticated systems can send orders or revenue through:

```text
POST /api/ingest
Authorization: Bearer <SCANFLOW_INGEST_KEY>
```

Supported payload kinds are `event` and `conversion`.

## Supabase connection

Apply `supabase/migrations/20260923193000_scanflow_core.sql`, then configure Vercel with:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TRACKING_SECRET`
- `SCANFLOW_INGEST_KEY`
- WhatsApp vars when that integration is enabled

The dashboard currently renders demonstration analytics so product/UX work can continue before the user's new isolated Supabase account is connected.
