import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSignature(raw: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function writeRows(table: "events" | "conversions", rows: Record<string, unknown>[]) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret || rows.length === 0) { console.info(`scanflow.whatsapp.${table}`, JSON.stringify(rows)); return; }
  const res = await fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=minimal" },
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
  if (!workspaceId) { console.info("scanflow.whatsapp_unmapped", raw); return NextResponse.json({ received: true, mapped: false }); }

  const body = JSON.parse(raw) as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; messages?: Array<Record<string, any>>; statuses?: Array<Record<string, any>> } }> }> };
  const events: Record<string, unknown>[] = [];
  const conversions: Record<string, unknown>[] = [];

  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    for (const message of value.messages || []) {
      const text = message.text?.body || "";
      const refMatch = text.match(/\[SF:([A-Za-z0-9_-]+)\]/);
      events.push({
        workspace_id: workspaceId,
        event_type: "whatsapp.message_received",
        occurred_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
        visitor_id: null,
        is_exact: true,
        metadata: { message_id: message.id, from: message.from, type: message.type, tracking_ref: refMatch?.[1] || null, phone_number_id: value.metadata?.phone_number_id },
      });
      conversions.push({
        workspace_id: workspaceId,
        conversion_type: "whatsapp_conversation",
        external_id: message.id,
        occurred_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
        metadata: { tracking_ref: refMatch?.[1] || null, from: message.from },
      });
    }
    for (const status of value.statuses || []) {
      events.push({
        workspace_id: workspaceId,
        event_type: `whatsapp.status.${status.status || "unknown"}`,
        occurred_at: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
        is_exact: true,
        metadata: { message_id: status.id, recipient_id: status.recipient_id, conversation: status.conversation, pricing: status.pricing },
      });
    }
  }

  await Promise.all([writeRows("events", events), writeRows("conversions", conversions)]);
  return NextResponse.json({ received: true, events: events.length });
}
