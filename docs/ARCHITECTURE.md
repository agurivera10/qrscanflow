# ScanFlow architecture

ScanFlow treats every printed QR as a permanent physical endpoint and every interaction as an event. The QR is not the analytics system; `/r/[slug]` is.

## Core flow

```text
printed QR
  ↓
/r/[slug]?u=<optional serialized unit token>
  ↓
resolve current QR version + physical unit/batch
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
- WhatsApp message joined through a ScanFlow tracking reference
- webhook events received from an authenticated integration
- order/revenue events sent to the authenticated ingest API

**Estimated signals**
- unique visitor counts based on first-party pseudonymous IDs
- deduplication when cookies are unavailable
- city / region / lat / lon derived from Vercel network headers
- device, OS and browser parsed from user agent
- WhatsApp conversations where the tracking reference was deleted before sending

GPS-level location is never collected unless a future explicit-consent experience asks the user for browser geolocation permission.

## Privacy model

- Raw visitor IP must not be persisted.
- `request_hash` is a daily rotating HMAC of ephemeral request signals for approximate deduplication.
- The raw IP is discarded immediately after hashing.
- `sf_vid` is a first-party HTTP-only pseudonymous visitor ID.
- `sf_sid` is a 30-minute first-party session ID.
- WhatsApp contact phone numbers are converted to a stable HMAC before analytics persistence.
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

For serialized mode each piece additionally carries a unit token:

```text
/r/milanga-folleto?u=4FQ9K2
/r/milanga-folleto?u=8M1D7P
```

The redirect resolves that public token to `distribution_unit_id` and `distribution_batch_id`, so every scan can be attributed to the exact printed unit when serialized mode is used.

Authenticated batch generation is available at:

```text
POST /api/serialize
Authorization: Bearer <SCANFLOW_INGEST_KEY>
```

It can create up to 10,000 serialized units per request.

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

When a routed destination is WhatsApp, ScanFlow appends a short marker such as `[SF:8K2QF7A]` to the prefilled message. The redirect event stores the same marker. If the customer sends the message with that marker intact, the webhook resolves the originating `qr.redirect` event and joins the exact QR, visitor/session and conversion. If the marker is edited away, ScanFlow records the conversation as unlinked rather than fabricating attribution.

## External business events

Authenticated systems can send orders or revenue through:

```text
POST /api/ingest
Authorization: Bearer <SCANFLOW_INGEST_KEY>
```

Supported payload kinds are `event` and `conversion`.

## Destination health

Authenticated health checks are available at:

```text
POST /api/health/destinations
Authorization: Bearer <SCANFLOW_INGEST_KEY>
```

Checks are protected against private-network targets to reduce SSRF risk. Health status is written back to `destinations` and failed checks create alerts. Scheduling can be attached to the endpoint once the production Vercel plan/cadence is chosen.

## QR safety

The current Studio safety score is explicitly a **preflight heuristic** based on print size, contrast assumptions, quiet zone and high error correction. It must not be presented as a real decoder simulation. A future QR QA Lab can add real multi-decoder image transforms (blur, perspective, compression, low-light simulation) before an asset receives a print-certified status.

## Supabase security

Migrations enable RLS on all exposed tables and then apply a second hardening migration with explicit Data API grants. Membership checks are performed through narrowly scoped `SECURITY DEFINER` helpers in the non-exposed `private` schema to avoid recursive RLS between `workspaces` and `workspace_members`. The functions explicitly require `auth.uid()` and are not exposed through the public API schema.

After migrations are applied to the new project, run Supabase security and performance advisors and resolve all relevant findings before production data is enabled.

## Supabase connection

Apply the migrations under `supabase/migrations/`, then configure Vercel with:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TRACKING_SECRET`
- `SCANFLOW_INGEST_KEY`
- WhatsApp vars when that integration is enabled

The dashboard currently renders demonstration analytics so product/UX work can continue before the user's new isolated Supabase account is connected.
