import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WaMessage = { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string } };
type WaStatus = { id?: string; recipient_id?: string; timestamp?: string; status?: string; conversation?: unknown; pricing?: unknown };
type SourceEvent = { id: string; visitor_id: string | null; session_id: string | null; qr_code_id: string | null };

function validSignature(raw: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function contactHash(contact?: string) {
  const secret = process.env.TRACKING_SECRET;
  if (!contact || !secret) return null;
  return createHmac("sha256", secret).update(`whatsapp:${contact}`).digest("hex");
}

function supabaseHeaders() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return secret ? { apikey: secret, Authorization: `Bearer ${secret}` } : null;
}

async function findSourceEvent(workspaceId: string, trackingRef?: string | null): Promise<SourceEvent | null> {
  const base = process.env.SUPABASE_URL;
  const headers = supabaseHeaders();
  if (!base || !headers || !trackingRef) return null;
  try {
    const url = new URL(`${base}/rest/v1/events`);
    url.searchParams.set("workspace_id", `eq.${workspaceId}`);
    url.searchParams.set("event_type", "eq.qr.redirect");
    url.searchParams.set("metadata", `cs.${JSON.stringify({ tracking_ref: trackingRef })}`);
    url.searchParams.set("select", "id,visitor_id,session_id,qr_code_id");
    url.searchParams.set("order", "occurred_at.desc");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const rows = await res.json() as SourceEvent[];
    return rows[0] || null;
  } catch { return null; }
}

async function writeRows(table: "events" | "conversions", rows: Record<string, unknown>[]) {
  const base = process.env.SUPABASE_URL;
  const headers = supabaseHeaders();
  if (!base || !headers || rows.length === 0) { console.info(`scanflow.whatsapp.${table}`, JSON.stringify(rows)); return; }
  const res = await fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows), cache: "no-store",
  });
  if (!res.ok) console.error("scanflow.whatsapp_write_failed", table, res.status, await res.text());
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse(challenge || "", { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) return new NextResponse("Invalid signature", { status: 401 });
  const workspaceId = process.env.WHATSAPP_WORKSPACE_ID;
  if (!workspaceId) { console.info("scanflow.whatsapp_unmapped"); return NextResponse.json({ received: true, mapped: false }); }

  const body = JSON.parse(raw) as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: WaMessage[]; statuses?: WaStatus[] } }> }> };
  const events: Record<string, unknown>[] = [];
  const conversions: Record<string, unknown>[] = [];

  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    for (const message of value.messages || []) {
      const text = message.text?.body || "";
      const trackingRef = text.match(/\[SF:([A-Za-z0-9_-]+)\]/)?.[1] || null;
      const source = await findSourceEvent(workspaceId, trackingRef);
      const occurredAt = message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString();
      const contact = contactHash(message.from);
      events.push({
        workspace_id: workspaceId,
        qr_code_id: source?.qr_code_id || null,
        event_type: "whatsapp.message_received",
        occurred_at: occurredAt,
        visitor_id: source?.visitor_id || null,
        session_id: source?.session_id || null,
        is_exact: Boolean(source),
        metadata: { message_id: message.id, contact_hash: contact, type: message.type, tracking_ref: trackingRef, source_event_id: source?.id || null, phone_number_id: value.metadata?.phone_number_id },
      });
      conversions.push({
        workspace_id: workspaceId,
        qr_code_id: source?.qr_code_id || null,
        source_event_id: source?.id || null,
        visitor_id: source?.visitor_id || null,
        session_id: source?.session_id || null,
        conversion_type: "whatsapp_conversation",
        external_id: message.id,
        occurred_at: occurredAt,
        metadata: { tracking_ref: trackingRef, contact_hash: contact, attribution: source ? "exact_tracking_ref" : "unlinked" },
      });
    }
    for (const status of value.statuses || []) {
      events.push({
        workspace_id: workspaceId,
        event_type: `whatsapp.status.${status.status || "unknown"}`,
        occurred_at: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
        is_exact: true,
        metadata: { message_id: status.id, recipient_hash: contactHash(status.recipient_id), conversation: status.conversation, pricing: status.pricing },
      });
    }
  }

  await Promise.all([writeRows("events", events), writeRows("conversions", conversions)]);
  return NextResponse.json({ received: true, events: events.length });
}
