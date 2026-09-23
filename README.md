# ScanFlow

QR analytics and redirect platform. Create permanent, trackable QR links that can route to WhatsApp or any URL while measuring scan activity.

## Current MVP

- Premium analytics dashboard preview
- Trackable redirect route: `/r/[slug]`
- WhatsApp deep-link support with prefilled messages
- Approximate Vercel geo metadata (country / region / city when available)
- QR preview generation and PNG download
- No visitor IP persistence
- Demo MILANGA QR at `/r/milanga-folleto`

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Vercel
- Supabase (next integration step)

## Local development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Architecture

```text
Printed QR
   ↓
/r/[slug]
   ↓
Scan event (timestamp + coarse geo + device metadata)
   ↓
Destination resolver
   ↓
WhatsApp / URL
```

The redirect URL is what is encoded in the printed QR. The final destination can later be changed without changing the physical QR.

## Next milestone

Replace the temporary demo redirect map and runtime logging with Supabase-backed workspaces, campaigns, QR codes, destinations and scan events. Add authentication and make dashboard metrics live.
